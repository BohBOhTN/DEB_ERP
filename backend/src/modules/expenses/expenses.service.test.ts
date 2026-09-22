import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ExpensesService } from "./expenses.service.js";

const expenseDate = new Date("2026-09-22T00:00:00.000Z");
const laterDate = new Date("2026-09-23T00:00:00.000Z");

describe("ExpensesService", () => {
  it("creates a draft expense that does not count yet", async () => {
    const { service } = makeService();

    const result = await service.createExpense(
      {
        categoryId: "category-1",
        expenseDate,
        amountTnd: "120.500",
        description: "Facture electricite septembre",
      },
      { actorUserId: "user-1" },
    );

    expect(result.expense).toMatchObject({
      reference: "DEP-000001",
      status: "DRAFT",
      amountTnd: "120.500",
      responsibleUserId: "user-1",
    });

    const totals = await service.getExpenseTotals({});
    expect(totals.totalTnd).toBe("0.000");
    expect(totals.postedCount).toBe(0);
  });

  it("posts an expense directly when asked", async () => {
    const { service } = makeService();

    const result = await service.createExpense(
      {
        categoryId: "category-1",
        expenseDate,
        amountTnd: "40.000",
        description: "Transport",
        post: true,
      },
      { actorUserId: "user-1" },
    );

    expect(result.expense).toMatchObject({
      status: "POSTED",
      postedByUserId: "user-1",
    });
  });

  it("posts a draft expense and counts it in the totals", async () => {
    const { service, prisma } = makeService();
    const created = await service.createExpense(
      {
        categoryId: "category-1",
        expenseDate,
        amountTnd: "120.500",
        description: "Facture electricite septembre",
      },
      { actorUserId: "user-1" },
    );

    await service.postExpense(
      created.expense.id,
      { version: created.expense.version, postedAt: expenseDate },
      { actorUserId: "user-1" },
    );

    const totals = await service.getExpenseTotals({});
    expect(totals.totalTnd).toBe("120.500");
    expect(totals.postedCount).toBe(1);
    expect(totals.byCategory).toEqual([
      expect.objectContaining({
        categoryName: "Electricite",
        totalTnd: "120.500",
      }),
    ]);
    expect(prisma.store.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "expense.post" }),
      ]),
    );
  });

  // AS-017: a cancelled expense stays in history with its reason and stops
  // counting towards any active total.
  it("keeps a cancelled expense in history and out of the totals", async () => {
    const { service, prisma } = makeService();
    const created = await service.createExpense(
      {
        categoryId: "category-1",
        expenseDate,
        amountTnd: "120.500",
        description: "Facture electricite septembre",
        post: true,
      },
      { actorUserId: "user-1" },
    );

    const cancelled = await service.cancelExpense(
      created.expense.id,
      {
        version: created.expense.version,
        cancelledAt: laterDate,
        reason: "Facture recue en double",
      },
      { actorUserId: "user-2" },
    );

    expect(cancelled.expense).toMatchObject({
      status: "CANCELLED",
      cancellationReason: "Facture recue en double",
      cancelledByUserId: "user-2",
    });
    // Still in history, never hard-deleted.
    expect(prisma.store.expenses).toHaveLength(1);

    const totals = await service.getExpenseTotals({});
    expect(totals.totalTnd).toBe("0.000");
    expect(totals.postedCount).toBe(0);
    expect(totals.byCategory).toEqual([]);

    const listed = await service.listExpenses({ page: 1, pageSize: 25 });
    expect(listed.items).toHaveLength(1);
  });

  it("requires a reason to cancel", async () => {
    const { service } = makeService();
    const created = await service.createExpense(
      {
        categoryId: "category-1",
        expenseDate,
        amountTnd: "40.000",
        description: "Transport",
        post: true,
      },
      { actorUserId: "user-1" },
    );

    await expect(
      service.cancelExpense(
        created.expense.id,
        {
          version: created.expense.version,
          cancelledAt: laterDate,
          reason: "   ",
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "EXPENSE_CANCELLATION_REASON_REQUIRED",
    });
  });

  it("rejects cancelling an already cancelled expense", async () => {
    const { service } = makeService();
    const created = await service.createExpense(
      {
        categoryId: "category-1",
        expenseDate,
        amountTnd: "40.000",
        description: "Transport",
        post: true,
      },
      { actorUserId: "user-1" },
    );
    const cancelled = await service.cancelExpense(
      created.expense.id,
      {
        version: created.expense.version,
        cancelledAt: laterDate,
        reason: "Erreur",
      },
      { actorUserId: "user-1" },
    );

    await expect(
      service.cancelExpense(
        created.expense.id,
        {
          version: cancelled.expense.version,
          cancelledAt: laterDate,
          reason: "Encore une erreur",
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "EXPENSE_NOT_CANCELLABLE",
    });
  });

  // EXP-007: a posted expense is history, so it cannot be edited.
  it("rejects editing a posted expense", async () => {
    const { service } = makeService();
    const created = await service.createExpense(
      {
        categoryId: "category-1",
        expenseDate,
        amountTnd: "40.000",
        description: "Transport",
        post: true,
      },
      { actorUserId: "user-1" },
    );

    await expect(
      service.updateExpense(
        created.expense.id,
        { version: created.expense.version, amountTnd: "50.000" },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "EXPENSE_NOT_EDITABLE",
    });
  });

  it("rejects posting an expense twice", async () => {
    const { service } = makeService();
    const created = await service.createExpense(
      {
        categoryId: "category-1",
        expenseDate,
        amountTnd: "40.000",
        description: "Transport",
      },
      { actorUserId: "user-1" },
    );
    const posted = await service.postExpense(
      created.expense.id,
      { version: created.expense.version, postedAt: expenseDate },
      { actorUserId: "user-1" },
    );

    await expect(
      service.postExpense(
        created.expense.id,
        { version: posted.expense.version, postedAt: expenseDate },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "EXPENSE_NOT_POSTABLE",
    });
  });

  // EXP-006: the amount must be greater than zero.
  it("rejects a non-positive amount", async () => {
    const { service } = makeService();

    await expect(
      service.createExpense(
        {
          categoryId: "category-1",
          expenseDate,
          amountTnd: "0",
          description: "Transport",
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "POSITIVE_AMOUNT_REQUIRED",
    });
  });

  it("rejects an inactive category", async () => {
    const { service, prisma } = makeService();
    prisma.store.expenseCategories[0].isActive = false;

    await expect(
      service.createExpense(
        {
          categoryId: "category-1",
          expenseDate,
          amountTnd: "40.000",
          description: "Transport",
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "ACTIVE_EXPENSE_CATEGORY_REQUIRED",
    });
  });

  it("rejects a stale version when posting", async () => {
    const { service } = makeService();
    const created = await service.createExpense(
      {
        categoryId: "category-1",
        expenseDate,
        amountTnd: "40.000",
        description: "Transport",
      },
      { actorUserId: "user-1" },
    );

    await expect(
      service.postExpense(
        created.expense.id,
        { version: created.expense.version + 5, postedAt: expenseDate },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });
  });
});

function makeService() {
  const prisma = new ExpensePrismaDouble();
  const service = new ExpensesService(prisma as unknown as PrismaClient);

  return { prisma, service };
}

type Row = Record<string, unknown>;

interface ExpenseStore {
  referenceSequence: number;
  expenseCategories: Array<{
    id: string;
    name: string;
    normalizedName: string;
    isActive: boolean;
    version: number;
  }>;
  expenses: Row[];
  auditEvents: Row[];
}

class ExpensePrismaDouble {
  public store = createExpenseStore();

  public readonly expenseCategory = {
    findMany: async () => this.store.expenseCategories,
  };

  public readonly expense = {
    findMany: async (args?: { where?: Row }) =>
      filterExpenses(this.store, args?.where),
    count: async (args?: { where?: Row }) =>
      filterExpenses(this.store, args?.where).length,
  };

  public async $transaction<TResult>(
    action:
      | Array<Promise<unknown>>
      | ((tx: ReturnType<typeof makeTransactionClient>) => Promise<TResult>),
  ): Promise<TResult> {
    if (Array.isArray(action)) {
      return (await Promise.all(action)) as TResult;
    }

    const staged = structuredClone(this.store) as ExpenseStore;
    const result = await action(makeTransactionClient(staged));
    this.store = staged;
    return result;
  }
}

function createExpenseStore(): ExpenseStore {
  return {
    referenceSequence: 0,
    expenseCategories: [
      {
        id: "category-1",
        name: "Electricite",
        normalizedName: "electricite",
        isActive: true,
        version: 1,
      },
    ],
    expenses: [],
    auditEvents: [],
  };
}

/// Mirrors the subset of Prisma filtering the service builds: category, status
/// and an expense-date range.
function filterExpenses(store: ExpenseStore, where?: Row) {
  return store.expenses.filter((expense) => {
    if (!where) {
      return true;
    }

    if (where.categoryId && expense.categoryId !== where.categoryId) {
      return false;
    }

    if (where.status && expense.status !== where.status) {
      return false;
    }

    const range = where.expenseDate as { gte?: Date; lte?: Date } | undefined;

    if (range) {
      const date = expense.expenseDate as Date;

      if (range.gte && date < range.gte) {
        return false;
      }

      if (range.lte && date > range.lte) {
        return false;
      }
    }

    return true;
  });
}

function makeTransactionClient(store: ExpenseStore) {
  const hydrate = (expense: Row) => ({
    ...expense,
    category:
      store.expenseCategories.find((item) => item.id === expense.categoryId) ??
      null,
  });
  const applyUpdate = (row: Row, data: Row) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "increment" in (value as Row)) {
        row[key] =
          Number(row[key] ?? 0) +
          Number((value as { increment: number }).increment);
        continue;
      }

      row[key] = value;
    }
  };

  return {
    $queryRaw: async () => {
      store.referenceSequence += 1;
      return [{ nextval: BigInt(store.referenceSequence) }];
    },
    expenseCategory: {
      findUnique: async (args: { where: { id: string } }) =>
        store.expenseCategories.find((item) => item.id === args.where.id) ??
        null,
    },
    expense: {
      findUnique: async (args: { where: { id: string } }) =>
        store.expenses.find((item) => item.id === args.where.id) ?? null,
      findUniqueOrThrow: async (args: { where: { id: string } }) => {
        const expense = store.expenses.find(
          (item) => item.id === args.where.id,
        );

        if (!expense) {
          throw new Error("missing expense");
        }

        return hydrate(expense);
      },
      create: async (args: { data: Row }) => {
        const expense: Row = {
          id: `expense-${store.expenses.length + 1}`,
          status: "DRAFT",
          version: 1,
          postedAt: null,
          postedByUserId: null,
          cancelledAt: null,
          cancelledByUserId: null,
          cancellationReason: null,
          ...args.data,
        };
        store.expenses.push(expense);
        return hydrate(expense);
      },
      updateMany: async (args: { where: Row; data: Row }) => {
        const { id, version, status } = args.where;
        const expense = store.expenses.find((item) => item.id === id);

        if (
          !expense ||
          (version !== undefined && expense.version !== version)
        ) {
          return { count: 0 };
        }

        if (status && typeof status === "object" && "in" in status) {
          if (!(status as { in: unknown[] }).in.includes(expense.status)) {
            return { count: 0 };
          }
        } else if (status && expense.status !== status) {
          return { count: 0 };
        }

        applyUpdate(expense, args.data);
        return { count: 1 };
      },
    },
    auditEvent: {
      create: async (args: { data: Row }) => {
        store.auditEvents.push(args.data);
      },
    },
  };
}
