import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { AuthService } from "../auth/auth.service.js";
import type {
  AuthRepository,
  StoredSession,
  StoredUser,
} from "../auth/auth.types.js";
import { hashPassword } from "../auth/password.service.js";

class InMemoryAuthRepository implements AuthRepository {
  public users = new Map<string, StoredUser>();
  public sessions = new Map<string, StoredSession>();
  public permissions = new Map<string, string[]>();

  public async findUserByEmail(email: string): Promise<StoredUser | null> {
    return this.users.get(email) ?? null;
  }

  public async findEffectivePermissionKeys(userId: string): Promise<string[]> {
    return this.permissions.get(userId) ?? [];
  }

  public async createSession(params: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    const user = [...this.users.values()].find(
      (candidate) => candidate.id === params.userId,
    );

    if (!user) {
      throw new Error("missing user");
    }

    this.sessions.set(params.tokenHash, {
      id: `session-${this.sessions.size + 1}`,
      userId: params.userId,
      tokenHash: params.tokenHash,
      expiresAt: params.expiresAt,
      revokedAt: null,
      user,
    });
  }

  public async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<StoredSession | null> {
    return this.sessions.get(tokenHash) ?? null;
  }

  public async touchSession(_sessionId: string): Promise<void> {
    return;
  }

  public async revokeSession(tokenHash: string): Promise<void> {
    const session = this.sessions.get(tokenHash);

    if (session) {
      session.revokedAt = new Date();
    }
  }

  public async createUser(params: {
    email: string;
    displayName: string;
    passwordHash: string;
  }): Promise<StoredUser> {
    const user = {
      id: `user-${this.users.size + 1}`,
      email: params.email,
      displayName: params.displayName,
      passwordHash: params.passwordHash,
      isActive: true,
    };

    this.users.set(user.email, user);
    return user;
  }
}

const expenseBody = {
  categoryId: "category-1",
  expenseDate: "2026-09-22T00:00:00.000Z",
  amountTnd: "120.500",
  description: "Facture electricite septembre",
};

async function createTestApp(permissionKeys: string[]) {
  const repository = new InMemoryAuthRepository();
  const authService = new AuthService(repository, 30);
  const user = await repository.createUser({
    email: "admin@example.com",
    displayName: "Admin",
    passwordHash: await hashPassword("correct-password"),
  });
  repository.permissions.set(user.id, permissionKeys);

  const expensesService = {
    listCategories: vi.fn().mockResolvedValue([]),
    createCategory: vi.fn().mockResolvedValue({ id: "category-1" }),
    updateCategory: vi.fn().mockResolvedValue({ id: "category-1" }),
    listExpenses: vi.fn().mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      pageCount: 0,
    }),
    getExpenseTotals: vi
      .fn()
      .mockResolvedValue({ totalTnd: "0.000", postedCount: 0 }),
    createExpense: vi.fn().mockResolvedValue({ expense: { id: "expense-1" } }),
    updateExpense: vi.fn().mockResolvedValue({ expense: { id: "expense-1" } }),
    postExpense: vi.fn().mockResolvedValue({ expense: { id: "expense-1" } }),
    cancelExpense: vi.fn().mockResolvedValue({ expense: { id: "expense-1" } }),
  };

  const app = createApp({
    allowedOrigins: ["http://localhost:5173"],
    healthCheck: async () => ({
      status: "ok",
      service: "api",
      environment: "test",
      database: {
        status: "ok",
      },
    }),
    auth: {
      authService,
      cookie: {
        name: "test_session",
        secure: false,
        maxAgeMs: 30 * 60 * 1000,
      },
      rateLimit: {
        maxAttempts: 100,
        windowMs: 60_000,
      },
    },
    expenses: {
      expensesService: expensesService as never,
    },
  });

  const login = await request(app)
    .post("/api/auth/login")
    .send({
      email: "admin@example.com",
      password: "correct-password",
    })
    .expect(200);

  return {
    app,
    cookie: login.headers["set-cookie"],
    expensesService,
  };
}

describe("expenses routes", () => {
  it("rejects anonymous expense access", async () => {
    const { app } = await createTestApp(["expenses.view"]);

    const response = await request(app).get("/api/expenses").expect(401);

    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects listing expenses without expenses.view", async () => {
    const { app, cookie, expensesService } = await createTestApp([
      "expenses.create",
    ]);

    const response = await request(app)
      .get("/api/expenses")
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(expensesService.listExpenses).not.toHaveBeenCalled();
  });

  it("lists expenses filtered by status and category", async () => {
    const { app, cookie, expensesService } = await createTestApp([
      "expenses.view",
    ]);

    await request(app)
      .get("/api/expenses?status=POSTED&categoryId=category-1")
      .set("Cookie", cookie)
      .expect(200);

    expect(expensesService.listExpenses).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "POSTED",
        categoryId: "category-1",
      }),
    );
  });

  it("reads totals with expenses.view", async () => {
    const { app, cookie, expensesService } = await createTestApp([
      "expenses.view",
    ]);

    await request(app)
      .get("/api/expense-totals")
      .set("Cookie", cookie)
      .expect(200);

    expect(expensesService.getExpenseTotals).toHaveBeenCalled();
  });

  it("rejects creating an expense without expenses.create", async () => {
    const { app, cookie, expensesService } = await createTestApp([
      "expenses.view",
    ]);

    const response = await request(app)
      .post("/api/expenses")
      .set("Cookie", cookie)
      .send(expenseBody)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(expensesService.createExpense).not.toHaveBeenCalled();
  });

  it("requires a description to create an expense", async () => {
    const { app, cookie, expensesService } = await createTestApp([
      "expenses.create",
    ]);

    await request(app)
      .post("/api/expenses")
      .set("Cookie", cookie)
      .send({ ...expenseBody, description: "   " })
      .expect(400);

    expect(expensesService.createExpense).not.toHaveBeenCalled();
  });

  it("creates an expense with expenses.create", async () => {
    const { app, cookie, expensesService } = await createTestApp([
      "expenses.create",
    ]);

    await request(app)
      .post("/api/expenses")
      .set("Cookie", cookie)
      .send({ ...expenseBody, post: true })
      .expect(201);

    expect(expensesService.createExpense).toHaveBeenCalledWith(
      expect.objectContaining({ amountTnd: "120.500", post: true }),
      expect.objectContaining({ actorUserId: "user-1" }),
    );
  });

  // EXP-008: cancelling is a separate authority from recording.
  it("rejects cancelling without expenses.cancel", async () => {
    const { app, cookie, expensesService } = await createTestApp([
      "expenses.create",
      "expenses.view",
    ]);

    const response = await request(app)
      .post("/api/expenses/expense-1/cancel")
      .set("Cookie", cookie)
      .send({
        version: 1,
        cancelledAt: "2026-09-23T00:00:00.000Z",
        reason: "Facture en double",
      })
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(expensesService.cancelExpense).not.toHaveBeenCalled();
  });

  it("requires a reason to cancel an expense", async () => {
    const { app, cookie, expensesService } = await createTestApp([
      "expenses.cancel",
    ]);

    await request(app)
      .post("/api/expenses/expense-1/cancel")
      .set("Cookie", cookie)
      .send({
        version: 1,
        cancelledAt: "2026-09-23T00:00:00.000Z",
        reason: "   ",
      })
      .expect(400);

    expect(expensesService.cancelExpense).not.toHaveBeenCalled();
  });

  it("cancels an expense with expenses.cancel", async () => {
    const { app, cookie, expensesService } = await createTestApp([
      "expenses.cancel",
    ]);

    await request(app)
      .post("/api/expenses/expense-1/cancel")
      .set("Cookie", cookie)
      .send({
        version: 1,
        cancelledAt: "2026-09-23T00:00:00.000Z",
        reason: "Facture en double",
      })
      .expect(200);

    expect(expensesService.cancelExpense).toHaveBeenCalledWith(
      "expense-1",
      expect.objectContaining({ reason: "Facture en double" }),
      expect.objectContaining({ actorUserId: "user-1" }),
    );
  });

  it("rejects managing categories without expense_categories.manage", async () => {
    const { app, cookie, expensesService } = await createTestApp([
      "expenses.create",
    ]);

    const response = await request(app)
      .post("/api/expense-categories")
      .set("Cookie", cookie)
      .send({ name: "Electricite" })
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(expensesService.createCategory).not.toHaveBeenCalled();
  });

  it("creates and deactivates a category with expense_categories.manage", async () => {
    const { app, cookie, expensesService } = await createTestApp([
      "expense_categories.manage",
    ]);

    await request(app)
      .post("/api/expense-categories")
      .set("Cookie", cookie)
      .send({ name: "Electricite" })
      .expect(201);
    await request(app)
      .patch("/api/expense-categories/category-1")
      .set("Cookie", cookie)
      .send({ version: 1, isActive: false })
      .expect(200);

    expect(expensesService.createCategory).toHaveBeenCalled();
    expect(expensesService.updateCategory).toHaveBeenCalledWith(
      "category-1",
      expect.objectContaining({ isActive: false }),
      expect.objectContaining({ actorUserId: "user-1" }),
    );
  });
});
