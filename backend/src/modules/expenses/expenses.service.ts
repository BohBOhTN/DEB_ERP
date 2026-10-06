import {
  ExpenseStatus,
  PaymentMethod,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { AppError } from "../../shared/appError.js";
import { orderByFor, type SortSpec } from "../../shared/listQuery.js";
import { postingTransactionOptions } from "../../shared/idempotency.js";
import { sumOrZero } from "../../shared/ledger.js";
import { normalizeName } from "../../shared/text.js";

/// EXP-001: categories are dynamic. These are the examples the source of truth
/// lists, seeded only when the table is still empty so the business can rename
/// or deactivate them freely afterwards.
const seedCategoryNames = [
  "Electricite",
  "Gaz",
  "Eau",
  "Salaires",
  "Transport",
  "Entretien",
  "Loyer",
  "Nettoyage",
  "Divers",
];

/// An expense may still be edited while it is a draft. Once posted it is
/// history and only cancellation can change it.
const editableStatuses = [ExpenseStatus.DRAFT] as const;
const cancellableStatuses = [
  ExpenseStatus.DRAFT,
  ExpenseStatus.POSTED,
] as const;

export interface ExpenseActor {
  actorUserId: string;
  correlationId?: string;
}

const dayMs = 24 * 60 * 60 * 1000;

export interface ExpenseListParams {
  sort?: SortSpec<"expenseDate" | "amountTnd">;
  categoryId?: string;
  status?: ExpenseStatus;
  /// Issue 018: the expenses of one shopping trip, or of one store.
  purchaseId?: string;
  supplierId?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

export interface CreateExpenseParams {
  categoryId: string;
  expenseDate: Date;
  amountTnd: string;
  description: string;
  externalReference?: string;
  notes?: string;
  responsibleUserId?: string;
  post?: boolean;
}

/// What an expense row carries beside its category: the store and the
/// purchase of the shopping trip it was recorded on (issue 018), both
/// null for a plain expense.
const expenseInclude = {
  category: true,
  supplier: { select: { id: true, name: true } },
  purchase: { select: { id: true, reference: true } },
} as const;

export class ExpensesService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async bootstrapExpenseData(): Promise<void> {
    const existing = await this.prisma.expenseCategory.count();

    if (existing > 0) {
      return;
    }

    await this.prisma.expenseCategory.createMany({
      data: seedCategoryNames.map((name) => ({
        name,
        normalizedName: normalizeName(name),
        createdByUserId: "system",
        updatedByUserId: "system",
      })),
    });
  }

  /// Categories with how many expenses use each (07 section 4.8), counted
  /// by the database in the same query, placed in their tree (issue 018):
  /// a parent first, its sub-categories right under it, siblings by name,
  /// the inactive ones last at every level. `path` reads "Fournitures ›
  /// Emballage" so a picker can say where a category sits. The whole table
  /// is read even when only the active rows are wanted: a path needs the
  /// parents.
  public async listCategories(params: { isActive?: boolean }) {
    const categories = await this.prisma.expenseCategory.findMany({
      include: { _count: { select: { expenses: true } } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });

    return categoryTree(categories)
      .filter(
        (category) =>
          params.isActive === undefined ||
          category.isActive === params.isActive,
      )
      .map(({ _count, ...category }) => ({
        ...category,
        expenseCount: _count.expenses,
      }));
  }

  public async createCategory(
    params: { name: string; description?: string; parentId?: string | null },
    actor: ExpenseActor,
  ) {
    const normalizedName = normalizeName(params.name);
    await this.assertCategoryNameAvailable(normalizedName);
    const parent = params.parentId
      ? await this.findActiveParentOrThrow(params.parentId)
      : null;

    const category = await this.prisma.expenseCategory.create({
      data: {
        name: params.name.trim(),
        normalizedName,
        description: emptyToNull(params.description),
        parentId: parent?.id ?? null,
        createdByUserId: actor.actorUserId,
        updatedByUserId: actor.actorUserId,
      },
    });

    await this.audit({
      actor,
      action: "expense_category.create",
      entity: "expense_category",
      targetId: category.id,
      after: category,
    });

    return category;
  }

  /// EXP-002 and EXP-003: a category is renamed or deactivated, never deleted,
  /// so historical expenses keep their category. Issue 018: it can be moved
  /// under another one (`parentId`, null for the top level), never under
  /// itself or one of its own sub-categories; an active sub-category keeps
  /// its parent active, so a parent is deactivated only once its children
  /// are, and a category comes back only under an active parent.
  public async updateCategory(
    categoryId: string,
    params: {
      version: number;
      name?: string;
      description?: string;
      parentId?: string | null;
      isActive?: boolean;
    },
    actor: ExpenseActor,
  ) {
    const existing = await this.findCategoryOrThrow(categoryId);
    const normalizedName =
      params.name !== undefined ? normalizeName(params.name) : undefined;
    const isActive = params.isActive ?? existing.isActive;
    const parentId =
      params.parentId === undefined ? existing.parentId : params.parentId;

    if (isActive && normalizedName) {
      await this.assertCategoryNameAvailable(normalizedName, existing.id);
    }

    if (params.parentId !== undefined && params.parentId !== null) {
      await this.assertParentAllowed(existing.id, params.parentId);
    } else if (isActive && !existing.isActive && parentId) {
      await this.findActiveParentOrThrow(parentId);
    }

    if (!isActive && existing.isActive) {
      const activeChildren = await this.prisma.expenseCategory.count({
        where: { parentId: existing.id, isActive: true },
      });

      if (activeChildren > 0) {
        throw new AppError({
          statusCode: 409,
          code: "EXPENSE_CATEGORY_HAS_ACTIVE_CHILDREN",
          message:
            "Désactivez d'abord ses sous-catégories avant cette catégorie.",
        });
      }
    }

    const result = await this.prisma.expenseCategory.updateMany({
      where: {
        id: categoryId,
        version: params.version,
      },
      data: {
        ...(params.name !== undefined
          ? { name: params.name.trim(), normalizedName }
          : {}),
        ...(params.description !== undefined
          ? { description: emptyToNull(params.description) }
          : {}),
        ...(params.parentId !== undefined ? { parentId: params.parentId } : {}),
        ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
        version: {
          increment: 1,
        },
        updatedByUserId: actor.actorUserId,
      },
    });

    assertVersionUpdated(result.count);
    const category = await this.findCategoryOrThrow(categoryId);

    await this.audit({
      actor,
      action: "expense_category.update",
      entity: "expense_category",
      targetId: category.id,
      before: existing,
      after: category,
    });

    return category;
  }

  public async listExpenses(params: ExpenseListParams) {
    const where = buildExpenseWhere(params);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        include: expenseInclude,
        orderBy: orderByFor<
          "expenseDate" | "amountTnd",
          Prisma.ExpenseOrderByWithRelationInput
        >(
          params.sort,
          {
            expenseDate: (direction) => [{ expenseDate: direction }],
            amountTnd: (direction) => [{ amountTnd: direction }],
          },
          [{ expenseDate: "desc" }, { createdAt: "desc" }],
          { id: "desc" },
        ),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  /// The release gate: cancelled expenses stay in history but never count
  /// towards an active total, so totals read posted expenses only.
  public async getExpenseTotals(params: {
    from?: Date;
    to?: Date;
    categoryId?: string;
  }) {
    // Without a range the call would read every expense ever posted; the
    // last thirty days is what the home page and the expense screen show.
    const to = params.to ?? new Date();
    const from =
      params.from ??
      (params.to ? undefined : new Date(to.getTime() - 30 * dayMs));
    const where = buildExpenseWhere({
      from,
      to,
      categoryId: params.categoryId,
      status: ExpenseStatus.POSTED,
    });

    const [overall, categoryTotals, byDate] = await Promise.all([
      this.prisma.expense.aggregate({
        where,
        _sum: { amountTnd: true },
        _count: { _all: true },
      }),
      this.prisma.expense.groupBy({
        by: ["categoryId"],
        where,
        _sum: { amountTnd: true },
      }),
      this.sumExpensesByBusinessDay({
        from,
        to,
        categoryId: params.categoryId,
      }),
    ]);
    const categories = await this.prisma.expenseCategory.findMany({
      where: { id: { in: categoryTotals.map((row) => row.categoryId) } },
      select: { id: true, name: true },
    });
    const categoryName = new Map(
      categories.map((category) => [category.id, category.name]),
    );
    const byCategory = categoryTotals
      .map((row) => ({
        categoryId: row.categoryId,
        categoryName: categoryName.get(row.categoryId) ?? "",
        totalTnd: sumOrZero(row._sum.amountTnd).toFixed(3),
      }))
      .filter((row) => new Prisma.Decimal(row.totalTnd).greaterThan(0))
      .sort((left, right) =>
        left.categoryName.localeCompare(right.categoryName),
      );

    return {
      totalTnd: sumOrZero(overall._sum.amountTnd).toFixed(3),
      postedCount: overall._count._all,
      byCategory,
      byDate,
      range: { from: from ?? null, to },
    };
  }

  /// Days are bucketed in the bakery's time zone by the database, so an
  /// expense entered at 00:30 in Tunis counts on that day and not the day
  /// before in UTC.
  public async getExpense(expenseId: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
      include: expenseInclude,
    });

    if (!expense) {
      throw new AppError({
        statusCode: 404,
        code: "EXPENSE_NOT_FOUND",
        message: "Dépense introuvable.",
      });
    }

    return expense;
  }

  private async sumExpensesByBusinessDay(params: {
    from?: Date;
    to: Date;
    categoryId?: string;
  }) {
    const rows = await this.prisma.$queryRaw<
      Array<{ day: string; total: string }>
    >`
      SELECT
        to_char(("expense_date" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Tunis', 'YYYY-MM-DD') AS day,
        SUM("amount_tnd")::text AS total
      FROM "expenses"
      WHERE "status" = 'POSTED'
        AND "expense_date" <= ${params.to}
        ${params.from ? Prisma.sql`AND "expense_date" >= ${params.from}` : Prisma.empty}
        ${params.categoryId ? Prisma.sql`AND "category_id" = ${params.categoryId}` : Prisma.empty}
      GROUP BY day
      ORDER BY day
    `;

    return rows.map((row) => ({
      day: row.day,
      totalTnd: new Prisma.Decimal(row.total).toFixed(3),
    }));
  }

  /// EXP-004 to EXP-006. A new expense starts as a draft unless the caller
  /// posts it straight away.
  public async createExpense(params: CreateExpenseParams, actor: ExpenseActor) {
    return this.prisma.$transaction(
      (tx) => this.createExpenseWith(tx, params, actor),
      postingTransactionOptions,
    );
  }

  /// The same recording inside a caller's transaction: a shopping trip
  /// (issue 018) posts a purchase and the expenses bought with it together,
  /// so an expense that fails takes the purchase down with it. Such an
  /// expense remembers the store and the purchase and is paid on the spot.
  public async createExpenseWith(
    tx: Prisma.TransactionClient,
    params: CreateExpenseParams & { supplierId?: string; purchaseId?: string },
    actor: ExpenseActor,
  ) {
    const amountTnd = parsePositiveMoney(params.amountTnd);
    const description = params.description.trim();

    if (!description) {
      throw new AppError({
        statusCode: 400,
        code: "EXPENSE_DESCRIPTION_REQUIRED",
        message: "Une description est obligatoire.",
      });
    }

    const category = await tx.expenseCategory.findUnique({
      where: {
        id: params.categoryId,
      },
    });

    if (!category || !category.isActive) {
      throw new AppError({
        statusCode: 400,
        code: "ACTIVE_EXPENSE_CATEGORY_REQUIRED",
        message: "Une catégorie de dépense active est obligatoire.",
      });
    }

    const expense = await tx.expense.create({
      data: {
        reference: await nextExpenseReference(tx),
        categoryId: category.id,
        status: params.post ? ExpenseStatus.POSTED : ExpenseStatus.DRAFT,
        expenseDate: params.expenseDate,
        amountTnd: amountTnd.toFixed(3),
        description,
        externalReference: emptyToNull(params.externalReference),
        method: PaymentMethod.CASH,
        notes: emptyToNull(params.notes),
        supplierId: params.supplierId ?? null,
        purchaseId: params.purchaseId ?? null,
        responsibleUserId: params.responsibleUserId ?? actor.actorUserId,
        ...(params.post
          ? {
              postedAt: params.expenseDate,
              postedByUserId: actor.actorUserId,
            }
          : {}),
        createdByUserId: actor.actorUserId,
        updatedByUserId: actor.actorUserId,
        correlationId: actor.correlationId,
      },
      include: expenseInclude,
    });

    await auditWithClient(tx, {
      actor,
      action: params.post ? "expense.post" : "expense.create",
      entity: "expense",
      targetId: expense.id,
      after: expense,
    });

    return { expense };
  }

  public async updateExpense(
    expenseId: string,
    params: {
      version: number;
      categoryId?: string;
      expenseDate?: Date;
      amountTnd?: string;
      description?: string;
      externalReference?: string;
      notes?: string;
    },
    actor: ExpenseActor,
  ) {
    const amountTnd =
      params.amountTnd === undefined
        ? undefined
        : parsePositiveMoney(params.amountTnd);

    return this.prisma.$transaction(async (tx) => {
      const existing = await findExpenseOrThrow(tx, expenseId);

      if (!editableStatuses.includes(existing.status as never)) {
        throw new AppError({
          statusCode: 409,
          code: "EXPENSE_NOT_EDITABLE",
          message: "Une dépense validée ne peut plus être modifiée.",
        });
      }

      if (params.categoryId) {
        const category = await tx.expenseCategory.findUnique({
          where: {
            id: params.categoryId,
          },
        });

        if (!category || !category.isActive) {
          throw new AppError({
            statusCode: 400,
            code: "ACTIVE_EXPENSE_CATEGORY_REQUIRED",
            message: "Une catégorie de dépense active est obligatoire.",
          });
        }
      }

      const updated = await tx.expense.updateMany({
        where: {
          id: expenseId,
          version: params.version,
        },
        data: {
          ...(params.categoryId ? { categoryId: params.categoryId } : {}),
          ...(params.expenseDate ? { expenseDate: params.expenseDate } : {}),
          ...(amountTnd ? { amountTnd: amountTnd.toFixed(3) } : {}),
          ...(params.description !== undefined
            ? { description: params.description.trim() }
            : {}),
          ...(params.externalReference !== undefined
            ? { externalReference: emptyToNull(params.externalReference) }
            : {}),
          ...(params.notes !== undefined
            ? { notes: emptyToNull(params.notes) }
            : {}),
          version: {
            increment: 1,
          },
          updatedByUserId: actor.actorUserId,
          correlationId: actor.correlationId,
        },
      });

      assertVersionUpdated(updated.count);
      const expense = await tx.expense.findUniqueOrThrow({
        where: {
          id: expenseId,
        },
        include: {
          category: true,
        },
      });

      await auditWithClient(tx, {
        actor,
        action: "expense.update",
        entity: "expense",
        targetId: expenseId,
        before: existing,
        after: expense,
      });

      return { expense };
    }, postingTransactionOptions);
  }

  /// EXP-007: posting is what makes an expense count. A posted expense is
  /// history and is never edited or hard-deleted afterwards.
  public async postExpense(
    expenseId: string,
    params: { version: number; postedAt: Date },
    actor: ExpenseActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await findExpenseOrThrow(tx, expenseId);

      if (existing.status !== ExpenseStatus.DRAFT) {
        throw new AppError({
          statusCode: 409,
          code: "EXPENSE_NOT_POSTABLE",
          message: "Seule une dépense en brouillon peut être validée.",
        });
      }

      const posted = await tx.expense.updateMany({
        where: {
          id: expenseId,
          version: params.version,
          status: ExpenseStatus.DRAFT,
        },
        data: {
          status: ExpenseStatus.POSTED,
          postedAt: params.postedAt,
          postedByUserId: actor.actorUserId,
          version: {
            increment: 1,
          },
          updatedByUserId: actor.actorUserId,
          correlationId: actor.correlationId,
        },
      });

      assertVersionUpdated(posted.count);
      const expense = await tx.expense.findUniqueOrThrow({
        where: {
          id: expenseId,
        },
        include: {
          category: true,
        },
      });

      await auditWithClient(tx, {
        actor,
        action: "expense.post",
        entity: "expense",
        targetId: expenseId,
        before: existing,
        after: expense,
      });

      return { expense };
    }, postingTransactionOptions);
  }

  /// EXP-008 and AS-017: a cancelled expense stays in history with a mandatory
  /// reason and actor, and stops counting towards active totals.
  public async cancelExpense(
    expenseId: string,
    params: { version: number; cancelledAt: Date; reason: string },
    actor: ExpenseActor,
  ) {
    const reason = params.reason.trim();

    if (!reason) {
      throw new AppError({
        statusCode: 400,
        code: "EXPENSE_CANCELLATION_REASON_REQUIRED",
        message: "Un motif d'annulation est obligatoire.",
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await findExpenseOrThrow(tx, expenseId);

      if (!cancellableStatuses.includes(existing.status as never)) {
        throw new AppError({
          statusCode: 409,
          code: "EXPENSE_NOT_CANCELLABLE",
          message: "Cette dépense est déjà annulée.",
        });
      }

      const cancelled = await tx.expense.updateMany({
        where: {
          id: expenseId,
          version: params.version,
          status: {
            in: [...cancellableStatuses],
          },
        },
        data: {
          status: ExpenseStatus.CANCELLED,
          cancelledAt: params.cancelledAt,
          cancelledByUserId: actor.actorUserId,
          cancellationReason: reason,
          version: {
            increment: 1,
          },
          updatedByUserId: actor.actorUserId,
          correlationId: actor.correlationId,
        },
      });

      assertVersionUpdated(cancelled.count);
      const expense = await tx.expense.findUniqueOrThrow({
        where: {
          id: expenseId,
        },
        include: {
          category: true,
        },
      });

      await auditWithClient(tx, {
        actor,
        action: "expense.cancel",
        entity: "expense",
        targetId: expenseId,
        before: existing,
        after: expense,
      });

      return { expense };
    }, postingTransactionOptions);
  }

  private async findCategoryOrThrow(categoryId: string) {
    const category = await this.prisma.expenseCategory.findUnique({
      where: {
        id: categoryId,
      },
    });

    if (!category) {
      throw new AppError({
        statusCode: 404,
        code: "EXPENSE_CATEGORY_NOT_FOUND",
        message: "Catégorie de dépense introuvable.",
      });
    }

    return category;
  }

  private async findActiveParentOrThrow(parentId: string) {
    const parent = await this.prisma.expenseCategory.findUnique({
      where: { id: parentId },
    });

    if (!parent || !parent.isActive) {
      throw new AppError({
        statusCode: 400,
        code: "ACTIVE_PARENT_CATEGORY_REQUIRED",
        message: "La catégorie parente doit exister et être active.",
      });
    }

    return parent;
  }

  /// A category goes under an active category that is neither itself nor
  /// one of its descendants: the chain of parents above the new parent is
  /// walked up and must never meet the category being moved.
  private async assertParentAllowed(categoryId: string, parentId: string) {
    if (parentId === categoryId) {
      throw new AppError({
        statusCode: 400,
        code: "EXPENSE_CATEGORY_PARENT_INVALID",
        message: "Une catégorie ne peut pas être sa propre parente.",
      });
    }

    await this.findActiveParentOrThrow(parentId);
    const parentOf = new Map(
      (
        await this.prisma.expenseCategory.findMany({
          select: { id: true, parentId: true },
        })
      ).map((row) => [row.id, row.parentId]),
    );

    let cursor: string | null | undefined = parentId;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      if (cursor === categoryId) {
        throw new AppError({
          statusCode: 400,
          code: "EXPENSE_CATEGORY_PARENT_INVALID",
          message:
            "Une catégorie ne peut pas être placée sous l'une de ses sous-catégories.",
        });
      }
      seen.add(cursor);
      cursor = parentOf.get(cursor);
    }
  }

  private async assertCategoryNameAvailable(
    normalizedName: string,
    excludingCategoryId?: string,
  ) {
    const existing = await this.prisma.expenseCategory.findFirst({
      where: {
        normalizedName,
        isActive: true,
        ...(excludingCategoryId ? { id: { not: excludingCategoryId } } : {}),
      },
    });

    if (existing) {
      throw new AppError({
        statusCode: 409,
        code: "EXPENSE_CATEGORY_NAME_EXISTS",
        message: "Une catégorie active avec ce nom existe déjà.",
      });
    }
  }

  private async audit(params: {
    actor?: ExpenseActor;
    action: string;
    entity: string;
    targetId?: string;
    before?: unknown;
    after?: unknown;
  }) {
    await auditWithClient(this.prisma, params);
  }
}

/// The categories in tree order with their depth and their path (issue
/// 018). The rows arrive sorted as siblings should read; a parent absent
/// from the rows, which the whole table never produces, puts its children
/// at the top level rather than losing them.
export function categoryTree<
  TRow extends {
    id: string;
    name: string;
    parentId: string | null;
  },
>(rows: TRow[]): Array<TRow & { depth: number; path: string }> {
  const ids = new Set(rows.map((row) => row.id));
  const childrenOf = new Map<string | null, TRow[]>();
  for (const row of rows) {
    const key = row.parentId && ids.has(row.parentId) ? row.parentId : null;
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), row]);
  }

  const ordered: Array<TRow & { depth: number; path: string }> = [];
  const seen = new Set<string>();
  const visit = (parentId: string | null, depth: number, prefix: string) => {
    for (const row of childrenOf.get(parentId) ?? []) {
      if (seen.has(row.id)) {
        continue;
      }
      seen.add(row.id);
      const path = prefix ? `${prefix} › ${row.name}` : row.name;
      ordered.push({ ...row, depth, path });
      visit(row.id, depth + 1, path);
    }
  };
  visit(null, 0, "");

  return ordered;
}

function buildExpenseWhere(params: {
  categoryId?: string;
  status?: ExpenseStatus;
  purchaseId?: string;
  supplierId?: string;
  from?: Date;
  to?: Date;
}) {
  return {
    ...(params.categoryId ? { categoryId: params.categoryId } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.purchaseId ? { purchaseId: params.purchaseId } : {}),
    ...(params.supplierId ? { supplierId: params.supplierId } : {}),
    ...(params.from || params.to
      ? {
          expenseDate: {
            ...(params.from ? { gte: params.from } : {}),
            ...(params.to ? { lte: params.to } : {}),
          },
        }
      : {}),
  };
}

async function findExpenseOrThrow(
  client: Prisma.TransactionClient,
  expenseId: string,
) {
  const expense = await client.expense.findUnique({
    where: {
      id: expenseId,
    },
  });

  if (!expense) {
    throw new AppError({
      statusCode: 404,
      code: "EXPENSE_NOT_FOUND",
      message: "Dépense introuvable.",
    });
  }

  return expense;
}

async function nextExpenseReference(client: Prisma.TransactionClient) {
  const rows = await client.$queryRaw<
    Array<{ nextval: bigint }>
  >`SELECT nextval('expense_reference_seq')`;
  const sequence = rows[0]?.nextval ?? BigInt(1);

  return `DEP-${sequence.toString().padStart(6, "0")}`;
}

async function auditWithClient(
  client: Pick<PrismaClient, "auditEvent"> | Prisma.TransactionClient,
  params: {
    actor?: ExpenseActor;
    action: string;
    entity: string;
    targetId?: string;
    before?: unknown;
    after?: unknown;
  },
) {
  await client.auditEvent.create({
    data: {
      actorUserId: params.actor?.actorUserId,
      action: params.action,
      entity: params.entity,
      targetId: params.targetId,
      correlationId: params.actor?.correlationId,
      before: params.before === undefined ? undefined : toJson(params.before),
      after: params.after === undefined ? undefined : toJson(params.after),
    },
  });
}

function parsePositiveMoney(value: string): Prisma.Decimal {
  const decimal = new Prisma.Decimal(value);

  if (!decimal.greaterThan(0)) {
    throw new AppError({
      statusCode: 400,
      code: "POSITIVE_AMOUNT_REQUIRED",
      message: "Le montant doit être supérieur à zéro.",
    });
  }

  return decimal.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

function assertVersionUpdated(count: number) {
  if (count === 0) {
    throw new AppError({
      statusCode: 409,
      code: "VERSION_CONFLICT",
      message: "Cet enregistrement a été modifié entre-temps.",
    });
  }
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function paginated<TItem>(
  items: TItem[],
  total: number,
  params: { page: number; pageSize: number },
) {
  return {
    items,
    page: params.page,
    pageSize: params.pageSize,
    total,
    pageCount: Math.ceil(total / params.pageSize),
  };
}
