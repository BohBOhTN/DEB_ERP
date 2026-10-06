import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { categoryTree, ExpensesService } from "./expenses.service.js";

/// Issue 018: sub-categories. A category sits under an active parent that
/// is neither itself nor one of its own descendants; a parent is
/// deactivated only once its sub-categories are; the list reads as a tree
/// with a path per row.
const actor = { actorUserId: "user-1" };

describe("ExpensesService categories tree", () => {
  it("creates a sub-category under an active parent", async () => {
    const { service, prisma } = makeService();

    const category = await service.createCategory(
      { name: "Emballage", parentId: "fournitures" },
      actor,
    );

    expect(category).toMatchObject({
      name: "Emballage",
      parentId: "fournitures",
    });
    expect(prisma.store.auditEvents).toEqual([
      expect.objectContaining({ action: "expense_category.create" }),
    ]);
  });

  it("refuses a parent that is missing or inactive", async () => {
    const { service } = makeService();

    await expect(
      service.createCategory({ name: "Papier", parentId: "nowhere" }, actor),
    ).rejects.toMatchObject({ code: "ACTIVE_PARENT_CATEGORY_REQUIRED" });
    await expect(
      service.createCategory({ name: "Papier", parentId: "archive" }, actor),
    ).rejects.toMatchObject({ code: "ACTIVE_PARENT_CATEGORY_REQUIRED" });
  });

  it("refuses a category as its own parent", async () => {
    const { service } = makeService();

    await expect(
      service.updateCategory(
        "fournitures",
        { version: 1, parentId: "fournitures" },
        actor,
      ),
    ).rejects.toMatchObject({ code: "EXPENSE_CATEGORY_PARENT_INVALID" });
  });

  it("refuses to place a category under one of its descendants", async () => {
    const { service } = makeService();

    // fournitures › sachets › petits: moving fournitures under petits would
    // close a loop.
    await expect(
      service.updateCategory(
        "fournitures",
        { version: 1, parentId: "petits" },
        actor,
      ),
    ).rejects.toMatchObject({ code: "EXPENSE_CATEGORY_PARENT_INVALID" });
  });

  it("moves a category under another one and back to the top level", async () => {
    const { service, prisma } = makeService();

    await service.updateCategory(
      "transport",
      { version: 1, parentId: "fournitures" },
      actor,
    );
    expect(prisma.category("transport")).toMatchObject({
      parentId: "fournitures",
      version: 2,
    });

    await service.updateCategory(
      "transport",
      { version: 2, parentId: null },
      actor,
    );
    expect(prisma.category("transport")).toMatchObject({
      parentId: null,
      version: 3,
    });
  });

  it("refuses to deactivate a parent with an active sub-category", async () => {
    const { service, prisma } = makeService();

    await expect(
      service.updateCategory(
        "fournitures",
        { version: 1, isActive: false },
        actor,
      ),
    ).rejects.toMatchObject({ code: "EXPENSE_CATEGORY_HAS_ACTIVE_CHILDREN" });
    expect(prisma.category("fournitures")).toMatchObject({ isActive: true });
  });

  it("deactivates a parent once its sub-categories are inactive", async () => {
    const { service, prisma } = makeService();

    await service.updateCategory(
      "petits",
      { version: 1, isActive: false },
      actor,
    );
    await service.updateCategory(
      "sachets",
      { version: 1, isActive: false },
      actor,
    );
    await service.updateCategory(
      "fournitures",
      { version: 1, isActive: false },
      actor,
    );

    expect(prisma.category("fournitures")).toMatchObject({ isActive: false });
  });

  it("brings a category back only under an active parent", async () => {
    const { service } = makeService();
    // "archive" is inactive and "vieux-papier" sits under it.
    await expect(
      service.updateCategory(
        "vieux-papier",
        { version: 1, isActive: true },
        actor,
      ),
    ).rejects.toMatchObject({ code: "ACTIVE_PARENT_CATEGORY_REQUIRED" });

    // Moved to the top level in the same update, it comes back.
    await expect(
      service.updateCategory(
        "vieux-papier",
        { version: 1, isActive: true, parentId: null },
        actor,
      ),
    ).resolves.toMatchObject({ isActive: true, parentId: null });
  });

  it("lists the tree in order with a depth and a path per row", async () => {
    const { service } = makeService();

    const rows = await service.listCategories({});

    expect(
      rows.map((row) => [row.id, row.depth, row.path, row.expenseCount]),
    ).toEqual([
      ["fournitures", 0, "Fournitures", 0],
      ["sachets", 1, "Fournitures › Sachets", 2],
      ["petits", 2, "Fournitures › Sachets › Petits", 0],
      ["transport", 0, "Transport", 1],
      ["archive", 0, "Archive", 0],
      ["vieux-papier", 1, "Archive › Vieux papier", 0],
    ]);
  });

  it("keeps the path of an active child when only active rows are wanted", async () => {
    const { service } = makeService();

    const rows = await service.listCategories({ isActive: true });

    expect(rows.map((row) => row.path)).toEqual([
      "Fournitures",
      "Fournitures › Sachets",
      "Fournitures › Sachets › Petits",
      "Transport",
    ]);
  });
});

describe("categoryTree", () => {
  it("attaches a row whose parent is absent to the top level", () => {
    const rows = categoryTree([
      { id: "a", name: "A", parentId: "missing" },
      { id: "b", name: "B", parentId: "a" },
    ]);

    expect(rows.map((row) => [row.depth, row.path])).toEqual([
      [0, "A"],
      [1, "A › B"],
    ]);
  });
});

type CategoryRow = {
  id: string;
  name: string;
  normalizedName: string;
  description: string | null;
  parentId: string | null;
  isActive: boolean;
  version: number;
  expenseCount: number;
};

type Row = Record<string, unknown>;

function makeService() {
  const prisma = new CategoryPrismaDouble();
  const service = new ExpensesService(prisma as unknown as PrismaClient);
  return { prisma, service };
}

function seed(): CategoryRow[] {
  const row = (
    id: string,
    name: string,
    parentId: string | null,
    isActive = true,
    expenseCount = 0,
  ): CategoryRow => ({
    id,
    name,
    normalizedName: name.toLowerCase(),
    description: null,
    parentId,
    isActive,
    version: 1,
    expenseCount,
  });

  return [
    row("fournitures", "Fournitures", null),
    row("sachets", "Sachets", "fournitures", true, 2),
    row("petits", "Petits", "sachets"),
    row("transport", "Transport", null, true, 1),
    row("archive", "Archive", null, false),
    row("vieux-papier", "Vieux papier", "archive", false),
  ];
}

/// The category table and the audit log; `findMany` answers in the order
/// the service asks for (active first, then by name) and carries the
/// expense count the way Prisma's `_count` does.
class CategoryPrismaDouble {
  public store = { categories: seed(), auditEvents: [] as Row[] };

  public readonly expenseCategory = {
    findMany: async (args?: { where?: Row; select?: Row }) => {
      const rows = [...this.store.categories]
        .filter((row) => matches(row, args?.where))
        .sort(
          (left, right) =>
            Number(right.isActive) - Number(left.isActive) ||
            left.name.localeCompare(right.name),
        );
      if (args?.select) {
        return rows.map((row) => ({ id: row.id, parentId: row.parentId }));
      }
      return rows.map(({ expenseCount, ...row }) => ({
        ...row,
        _count: { expenses: expenseCount },
      }));
    },
    findUnique: async (args: { where: { id: string } }) =>
      this.store.categories.find((row) => row.id === args.where.id) ?? null,
    findFirst: async (args: { where: Row }) =>
      this.store.categories.find((row) => matches(row, args.where)) ?? null,
    count: async (args: { where: Row }) =>
      this.store.categories.filter((row) => matches(row, args.where)).length,
    create: async (args: { data: Row }) => {
      const row = {
        id: `category-${this.store.categories.length + 1}`,
        description: null,
        parentId: null,
        isActive: true,
        version: 1,
        expenseCount: 0,
        ...args.data,
      } as CategoryRow;
      this.store.categories.push(row);
      return row;
    },
    updateMany: async (args: { where: Row; data: Row }) => {
      const row = this.store.categories.find(
        (candidate) =>
          candidate.id === args.where.id &&
          candidate.version === args.where.version,
      );
      if (!row) {
        return { count: 0 };
      }
      for (const [key, value] of Object.entries(args.data)) {
        if (key === "version") {
          row.version += 1;
        } else {
          (row as Row)[key] = value;
        }
      }
      return { count: 1 };
    },
  };

  public readonly auditEvent = {
    create: async (args: { data: Row }) => {
      this.store.auditEvents.push(args.data);
    },
  };

  public category(id: string) {
    return this.store.categories.find((row) => row.id === id);
  }
}

function matches(row: CategoryRow, where?: Row): boolean {
  if (!where) {
    return true;
  }
  for (const [key, value] of Object.entries(where)) {
    const actual = (row as Row)[key];
    if (value && typeof value === "object" && "not" in (value as Row)) {
      if (actual === (value as { not: unknown }).not) {
        return false;
      }
      continue;
    }
    if (actual !== value) {
      return false;
    }
  }
  return true;
}
