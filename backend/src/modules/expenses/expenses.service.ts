import { ExpenseStatus, Prisma, type PrismaClient } from "@prisma/client";
import { AppError } from "../../shared/appError.js";
import { normalizeName } from "../catalog/catalog.service.js";

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

export interface ExpenseListParams {
  categoryId?: string;
  status?: ExpenseStatus;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

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

  public async listCategories(params: { isActive?: boolean }) {
    return this.prisma.expenseCategory.findMany({
      where: {
        ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
  }

  public async createCategory(
    params: { name: string; description?: string },
    actor: ExpenseActor,
  ) {
    const normalizedName = normalizeName(params.name);
    await this.assertCategoryNameAvailable(normalizedName);

    const category = await this.prisma.expenseCategory.create({
      data: {
        name: params.name.trim(),
        normalizedName,
        description: emptyToNull(params.description),
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
  /// so historical expenses keep their category.
  public async updateCategory(
    categoryId: string,
    params: {
      version: number;
      name?: string;
      description?: string;
      isActive?: boolean;
    },
    actor: ExpenseActor,
  ) {
    const existing = await this.findCategoryOrThrow(categoryId);
    const normalizedName =
      params.name !== undefined ? normalizeName(params.name) : undefined;

    if ((params.isActive ?? existing.isActive) && normalizedName) {
      await this.assertCategoryNameAvailable(normalizedName, existing.id);
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
        include: {
          category: true,
        },
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  /// The release gate: cancelled expenses stay in history but never count
  /// towards an active total, so totals read posted expenses only.
  public async getExpenseTotals(params: { from?: Date; to?: Date }) {
    const where = buildExpenseWhere({
      ...params,
      status: ExpenseStatus.POSTED,
    });
    const [expenses, categories] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        select: {
          categoryId: true,
          amountTnd: true,
          expenseDate: true,
        },
      }),
      this.prisma.expenseCategory.findMany(),
    ]);
    const byCategory = categories
      .map((category) => ({
        categoryId: category.id,
        categoryName: category.name,
        totalTnd: sumDecimals(
          expenses
            .filter((expense) => expense.categoryId === category.id)
            .map((expense) => new Prisma.Decimal(expense.amountTnd)),
          3,
        ).toFixed(3),
      }))
      .filter((row) => new Prisma.Decimal(row.totalTnd).greaterThan(0));
    const byDate = [
      ...new Set(
        expenses.map((expense) =>
          expense.expenseDate.toISOString().slice(0, 10),
        ),
      ),
    ]
      .sort()
      .map((day) => ({
        day,
        totalTnd: sumDecimals(
          expenses
            .filter(
              (expense) =>
                expense.expenseDate.toISOString().slice(0, 10) === day,
            )
            .map((expense) => new Prisma.Decimal(expense.amountTnd)),
          3,
        ).toFixed(3),
      }));

    return {
      totalTnd: sumDecimals(
        expenses.map((expense) => new Prisma.Decimal(expense.amountTnd)),
        3,
      ).toFixed(3),
      postedCount: expenses.length,
      byCategory,
      byDate,
    };
  }

  /// EXP-004 to EXP-006. A new expense starts as a draft unless the caller
  /// posts it straight away.
  public async createExpense(
    params: {
      categoryId: string;
      expenseDate: Date;
      amountTnd: string;
      description: string;
      externalReference?: string;
      notes?: string;
      responsibleUserId?: string;
      post?: boolean;
    },
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

    return this.prisma.$transaction(async (tx) => {
      const category = await tx.expenseCategory.findUnique({
        where: {
          id: params.categoryId,
        },
      });

      if (!category || !category.isActive) {
        throw new AppError({
          statusCode: 400,
          code: "ACTIVE_EXPENSE_CATEGORY_REQUIRED",
          message: "Une categorie de depense active est obligatoire.",
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
          notes: emptyToNull(params.notes),
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
        include: {
          category: true,
        },
      });

      await auditWithClient(tx, {
        actor,
        action: params.post ? "expense.post" : "expense.create",
        entity: "expense",
        targetId: expense.id,
        after: expense,
      });

      return { expense };
    });
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
          message: "Une depense validee ne peut plus etre modifiee.",
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
            message: "Une categorie de depense active est obligatoire.",
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
    });
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
          message: "Seule une depense en brouillon peut etre validee.",
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
    });
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
          message: "Cette depense est deja annulee.",
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
    });
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
        message: "Categorie de depense introuvable.",
      });
    }

    return category;
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
        message: "Une categorie active avec ce nom existe deja.",
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

function buildExpenseWhere(params: {
  categoryId?: string;
  status?: ExpenseStatus;
  from?: Date;
  to?: Date;
}) {
  return {
    ...(params.categoryId ? { categoryId: params.categoryId } : {}),
    ...(params.status ? { status: params.status } : {}),
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
      message: "Depense introuvable.",
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
      message: "Le montant doit etre superieur a zero.",
    });
  }

  return decimal.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

function sumDecimals(values: Prisma.Decimal[], scale: number): Prisma.Decimal {
  return values
    .reduce((total, value) => total.plus(value), new Prisma.Decimal(0))
    .toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_UP);
}

function assertVersionUpdated(count: number) {
  if (count === 0) {
    throw new AppError({
      statusCode: 409,
      code: "CONCURRENT_UPDATE",
      message: "Cet enregistrement a ete modifie entre-temps.",
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
