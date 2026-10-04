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

async function createTestApp(permissionKeys: string[]) {
  const repository = new InMemoryAuthRepository();
  const authService = new AuthService(repository, 30);
  const user = await repository.createUser({
    email: "admin@example.com",
    displayName: "Admin",
    passwordHash: await hashPassword("correct-password"),
  });
  repository.permissions.set(user.id, permissionKeys);

  const posService = {
    listProducts: vi.fn().mockResolvedValue({
      items: [
        {
          id: "product-1",
          name: "Baguette",
          salePriceTnd: "2.500",
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
      pageCount: 1,
    }),
    listCustomers: vi.fn().mockResolvedValue({
      items: [
        {
          id: "customer-1",
          name: "Maison Ahmed",
          isActive: true,
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
      pageCount: 1,
    }),
    getCurrentSession: vi.fn().mockResolvedValue({
      id: "session-1",
      status: "OPEN",
      openingCashTnd: "20.000",
    }),
    openSession: vi.fn().mockResolvedValue({
      session: {
        id: "session-1",
        status: "OPEN",
        openingCashTnd: "20.000",
      },
    }),
    closeSession: vi.fn().mockResolvedValue({
      session: {
        id: "session-1",
        status: "CLOSED",
        countedCashTnd: "50.000",
        expectedCashTnd: "45.000",
        cashDifferenceTnd: "5.000",
      },
    }),
    summarizeSales: vi.fn().mockResolvedValue({ count: 0 }),
    summarizeSessions: vi.fn().mockResolvedValue({ count: 2 }),
    getSession: vi.fn().mockResolvedValue({ session: { id: "session-1" } }),
    cancelSale: vi
      .fn()
      .mockResolvedValue({ sale: { id: "sale-1", status: "CANCELLED" } }),
    postPaidSale: vi.fn().mockResolvedValue({
      sale: {
        id: "sale-1",
        totalTnd: "5.000",
        paymentState: "PAID",
      },
    }),
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
    pos: {
      posService: posService as never,
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
    posService,
  };
}

describe("pos routes", () => {
  it("rejects anonymous session access", async () => {
    const { app } = await createTestApp(["pos.access"]);

    const response = await request(app)
      .get("/api/pos/sessions/current")
      .expect(401);

    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects direct API access without the exact POS permission", async () => {
    const { app, cookie, posService } = await createTestApp([]);

    const response = await request(app)
      .get("/api/pos/sessions/current")
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(posService.getCurrentSession).not.toHaveBeenCalled();
  });

  it("lists POS products when the user has pos.access", async () => {
    const { app, cookie, posService } = await createTestApp(["pos.access"]);

    const response = await request(app)
      .get("/api/pos/products?search=baguette")
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data.products.items).toEqual([
      expect.objectContaining({
        id: "product-1",
        name: "Baguette",
      }),
    ]);
    expect(posService.listProducts).toHaveBeenCalledWith({
      search: "baguette",
      page: 1,
      pageSize: 25,
    });
  });

  it("lists active customers when the user can create credit sales", async () => {
    const { app, cookie, posService } = await createTestApp([
      "pos.credit_sale",
    ]);

    const response = await request(app)
      .get("/api/pos/customers?search=ahmed")
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data.customers.items).toEqual([
      expect.objectContaining({
        id: "customer-1",
        name: "Maison Ahmed",
      }),
    ]);
    expect(posService.listCustomers).toHaveBeenCalledWith({
      search: "ahmed",
      page: 1,
      pageSize: 25,
    });
  });

  it("rejects POS customer lookup without credit sale permission", async () => {
    const { app, cookie, posService } = await createTestApp(["pos.access"]);

    const response = await request(app)
      .get("/api/pos/customers")
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(posService.listCustomers).not.toHaveBeenCalled();
  });

  it("opens a session when the user has pos.open_session", async () => {
    const { app, cookie, posService } = await createTestApp([
      "pos.open_session",
    ]);

    const response = await request(app)
      .post("/api/pos/sessions/open")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "open-session-1")
      .send({
        openingCashTnd: "20.000",
        openedAt: "2026-09-21T08:00:00.000Z",
      })
      .expect(201);

    expect(response.body.data.session).toMatchObject({
      id: "session-1",
      status: "OPEN",
    });
    expect(posService.openSession).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "open-session-1",
        openingCashTnd: "20.000",
      }),
      expect.objectContaining({
        actorUserId: "user-1",
      }),
    );
  });

  it("requires an idempotency key for paid sales", async () => {
    const { app, cookie, posService } = await createTestApp(["pos.sell"]);

    const response = await request(app)
      .post("/api/pos/sales")
      .set("Cookie", cookie)
      .send({
        lines: [
          {
            productId: "product-1",
            quantity: "2",
          },
        ],
      })
      .expect(400);

    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(posService.postPaidSale).not.toHaveBeenCalled();
  });

  it("posts paid sales when the user has pos.sell", async () => {
    const { app, cookie, posService } = await createTestApp(["pos.sell"]);

    const response = await request(app)
      .post("/api/pos/sales")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "sale-1")
      .send({
        sessionId: "session-1",
        soldAt: "2026-09-21T08:05:00.000Z",
        lines: [
          {
            productId: "product-1",
            quantity: "2",
          },
        ],
      })
      .expect(201);

    expect(response.body.data.sale).toMatchObject({
      id: "sale-1",
      paymentState: "PAID",
    });
    expect(posService.postPaidSale).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "sale-1",
        sessionId: "session-1",
        lines: [
          {
            productId: "product-1",
            quantity: "2",
          },
        ],
      }),
      expect.objectContaining({
        actorUserId: "user-1",
      }),
    );
  });

  // Issue #43: the route no longer refuses every sale that names an amount;
  // it tells the service whether credit may be granted and the service
  // decides from the remainder it computes.
  it("passes the credit permission to the service instead of refusing amounts", async () => {
    const { app, cookie, posService } = await createTestApp(["pos.sell"]);

    await request(app)
      .post("/api/pos/sales")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "sale-credit-1")
      .send({
        sessionId: "session-1",
        customerId: "customer-1",
        paidAmountTnd: "2.000",
        lines: [
          {
            productId: "product-1",
            quantity: "2",
          },
        ],
      })
      .expect(201);

    expect(posService.postPaidSale).toHaveBeenCalledWith(
      expect.objectContaining({ creditAllowed: false }),
      expect.anything(),
    );
  });

  it("posts partial sales when the user has pos.credit_sale", async () => {
    const { app, cookie, posService } = await createTestApp([
      "pos.sell",
      "pos.credit_sale",
    ]);

    await request(app)
      .post("/api/pos/sales")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "sale-credit-1")
      .send({
        sessionId: "session-1",
        customerId: "customer-1",
        paidAmountTnd: "2.000",
        lines: [
          {
            productId: "product-1",
            quantity: "2",
          },
        ],
      })
      .expect(201);

    expect(posService.postPaidSale).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "sale-credit-1",
        sessionId: "session-1",
        customerId: "customer-1",
        paidAmountTnd: "2.000",
        creditAllowed: true,
      }),
      expect.objectContaining({
        actorUserId: "user-1",
      }),
    );
  });

  it("closes a session when the user has pos.close_session", async () => {
    const { app, cookie, posService } = await createTestApp([
      "pos.close_session",
    ]);

    const response = await request(app)
      .post("/api/pos/sessions/session-1/close")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "close-session-1")
      .send({
        countedCashTnd: "50.000",
        closedAt: "2026-09-21T12:00:00.000Z",
      })
      .expect(201);

    expect(response.body.data.session).toMatchObject({
      id: "session-1",
      status: "CLOSED",
    });
    expect(posService.closeSession).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        idempotencyKey: "close-session-1",
        countedCashTnd: "50.000",
      }),
      expect.objectContaining({
        actorUserId: "user-1",
      }),
    );
  });

  describe("sale cancellation and figures (issue #44)", () => {
    it("cancels a sale with pos.cancel_sale, a reason and an idempotency key", async () => {
      const { app, cookie, posService } = await createTestApp([
        "pos.cancel_sale",
      ]);

      await request(app)
        .post("/api/v1/pos/sales/sale-1/cancel")
        .set("Cookie", cookie)
        .set("Idempotency-Key", "cancel-1")
        .send({ reason: "Erreur de saisie" })
        .expect(201);

      expect(posService.cancelSale).toHaveBeenCalledWith(
        "sale-1",
        { idempotencyKey: "cancel-1", reason: "Erreur de saisie" },
        expect.objectContaining({ actorUserId: expect.any(String) }),
      );
    });

    it("refuses the cancellation to a cashier without pos.cancel_sale", async () => {
      const { app, cookie, posService } = await createTestApp([
        "pos.access",
        "pos.sell",
        "pos.credit_sale",
      ]);

      await request(app)
        .post("/api/v1/pos/sales/sale-1/cancel")
        .set("Cookie", cookie)
        .set("Idempotency-Key", "cancel-1")
        .send({ reason: "Erreur de saisie" })
        .expect(403);

      expect(posService.cancelSale).not.toHaveBeenCalled();
    });

    it("serves the sales figures with the list's filters", async () => {
      const { app, cookie, posService } = await createTestApp(["pos.access"]);

      await request(app)
        .get("/api/v1/pos/sales/summary?from=2026-09-24&to=2026-09-24&q=amel")
        .set("Cookie", cookie)
        .expect(200);

      expect(posService.summarizeSales).toHaveBeenCalledWith(
        expect.objectContaining({ search: "amel" }),
      );
    });
  });
});

describe("pos session history (issue 014)", () => {
  it("serves the session totals with the list's filters, ahead of the :sessionId route", async () => {
    const { app, cookie, posService } = await createTestApp(["pos.access"]);

    const response = await request(app)
      .get(
        "/api/v1/pos/sessions/summary?from=2026-09-01&to=2026-09-30&status=CLOSED",
      )
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data.summary).toEqual({ count: 2 });
    expect(posService.summarizeSessions).toHaveBeenCalledWith({
      // Whole business days in Tunis (UTC+1).
      from: new Date("2026-08-31T23:00:00.000Z"),
      to: new Date("2026-09-30T22:59:59.999Z"),
      status: "CLOSED",
    });
    expect(posService.getSession).not.toHaveBeenCalled();
  });

  it("refuses the session totals without pos.access", async () => {
    const { app, cookie, posService } = await createTestApp(["orders.view"]);

    await request(app)
      .get("/api/v1/pos/sessions/summary")
      .set("Cookie", cookie)
      .expect(403);

    expect(posService.summarizeSessions).not.toHaveBeenCalled();
  });
});
