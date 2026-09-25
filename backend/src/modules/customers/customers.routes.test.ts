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

  const customersService = {
    listCustomers: vi.fn().mockResolvedValue({
      items: [{ id: "customer-1", name: "Client Comptoir", version: 1 }],
      page: 1,
      pageSize: 25,
      total: 1,
      pageCount: 1,
    }),
    createCustomer: vi.fn().mockResolvedValue({
      id: "customer-1",
      name: "Client Comptoir",
      version: 1,
    }),
    updateCustomer: vi.fn().mockResolvedValue({
      id: "customer-1",
      name: "Client Comptoir",
      isActive: false,
      version: 2,
    }),
    listCustomerBalances: vi.fn().mockResolvedValue({
      items: [{ customer: { id: "customer-1" }, balanceTnd: "30.000" }],
      page: 1,
      pageSize: 25,
      total: 1,
      pageCount: 1,
    }),
    getCustomerStatement: vi.fn().mockResolvedValue({
      customer: { id: "customer-1" },
      balanceTnd: "30.000",
      sales: [],
      ledgerEntries: [],
      payments: [],
    }),
    setCustomerActive: vi
      .fn()
      .mockResolvedValue({ id: "customer-1", isActive: false, version: 2 }),
    getCustomerSummary: vi.fn().mockResolvedValue({ ordersCount: 0 }),
    listCustomerSales: vi.fn().mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      pageCount: 0,
    }),
    reverseCustomerPayment: vi.fn().mockResolvedValue({
      payment: { id: "payment-1", reversedAt: "2026-09-24T10:00:00.000Z" },
    }),
    listCustomerPayments: vi.fn().mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      pageCount: 0,
    }),
    createCustomerPayment: vi.fn().mockResolvedValue({
      payment: {
        id: "payment-1",
        amountTnd: "20.000",
      },
      allocations: [],
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
    customers: {
      customersService: customersService as never,
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
    customersService,
  };
}

describe("customer routes", () => {
  it("rejects anonymous customer access", async () => {
    const { app } = await createTestApp(["customers.view"]);

    const response = await request(app).get("/api/customers").expect(401);

    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects customer access without exact permission", async () => {
    const { app, cookie, customersService } = await createTestApp([]);

    const response = await request(app)
      .get("/api/customers")
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(customersService.listCustomers).not.toHaveBeenCalled();
  });

  it("lists customers when the user has customers.view", async () => {
    const { app, cookie, customersService } = await createTestApp([
      "customers.view",
    ]);

    await request(app)
      .get("/api/customers?search=client&isActive=true")
      .set("Cookie", cookie)
      .expect(200);

    expect(customersService.listCustomers).toHaveBeenCalledWith({
      search: "client",
      isActive: true,
      page: 1,
      pageSize: 25,
    });
  });

  it("creates customers when the user has customers.create", async () => {
    const { app, cookie, customersService } = await createTestApp([
      "customers.create",
    ]);

    await request(app)
      .post("/api/customers")
      .set("Cookie", cookie)
      .send({
        name: "Client Comptoir",
        phone: "22111222",
      })
      .expect(201);

    expect(customersService.createCustomer).toHaveBeenCalledWith(
      {
        name: "Client Comptoir",
        phone: "22111222",
      },
      expect.objectContaining({
        actorUserId: "user-1",
      }),
    );
  });

  it("lists customer balances when the user has customer_balances.view", async () => {
    const { app, cookie, customersService } = await createTestApp([
      "customer_balances.view",
    ]);

    await request(app)
      .get("/api/customer-balances")
      .set("Cookie", cookie)
      .expect(200);

    expect(customersService.listCustomerBalances).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
    });
  });

  it("requires an idempotency key to create customer payments", async () => {
    const { app, cookie, customersService } = await createTestApp([
      "customer_payments.create",
    ]);

    const response = await request(app)
      .post("/api/customer-payments")
      .set("Cookie", cookie)
      .send({
        customerId: "customer-1",
        paidAt: "2026-09-21T08:00:00.000Z",
        amountTnd: "20.000",
      })
      .expect(400);

    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(customersService.createCustomerPayment).not.toHaveBeenCalled();
  });

  it("creates customer payments when the user has customer_payments.create", async () => {
    const { app, cookie, customersService } = await createTestApp([
      "customer_payments.create",
    ]);

    await request(app)
      .post("/api/customer-payments")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "customer-payment-1")
      .send({
        customerId: "customer-1",
        paidAt: "2026-09-21T08:00:00.000Z",
        amountTnd: "20.000",
        allocations: [
          {
            saleId: "sale-1",
            amountTnd: "20.000",
          },
        ],
      })
      .expect(201);

    expect(customersService.createCustomerPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "customer-payment-1",
        customerId: "customer-1",
        amountTnd: "20.000",
        allocations: [
          {
            saleId: "sale-1",
            amountTnd: "20.000",
          },
        ],
      }),
      expect.objectContaining({
        actorUserId: "user-1",
      }),
    );
  });
});

describe("customer payment reversal", () => {
  it("refuses the reversal without customer_payments.create", async () => {
    const { app, cookie, customersService } = await createTestApp([
      "customer_payments.view",
    ]);

    await request(app)
      .post("/api/v1/customer-payments/payment-1/reverse")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "reverse-1")
      .send({ reason: "Montant saisi par erreur" })
      .expect(403);

    expect(customersService.reverseCustomerPayment).not.toHaveBeenCalled();
  });

  it("reverses a payment with a reason and an idempotency key", async () => {
    const { app, cookie, customersService } = await createTestApp([
      "customer_payments.create",
    ]);

    await request(app)
      .post("/api/v1/customer-payments/payment-1/reverse")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "reverse-1")
      .send({ reason: "Montant saisi par erreur" })
      .expect(201);

    expect(customersService.reverseCustomerPayment).toHaveBeenCalledWith(
      "payment-1",
      { idempotencyKey: "reverse-1", reason: "Montant saisi par erreur" },
      expect.objectContaining({ actorUserId: expect.any(String) }),
    );
  });
});

/// AS-V2-07: every router serves both prefixes. The v1 contract returns a
/// list as the data itself; the legacy prefix keeps the V1 wrapper and says
/// it is deprecated.
describe("api versioning", () => {
  it("serves the v1 list envelope under /api/v1", async () => {
    const { app, cookie } = await createTestApp(["customers.view"]);

    const response = await request(app)
      .get("/api/v1/customers")
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data).toMatchObject({
      items: [{ id: "customer-1" }],
      page: 1,
      pageSize: 25,
      total: 1,
      pageCount: 1,
    });
    expect(response.body.data.customers).toBeUndefined();
    expect(response.headers.deprecation).toBeUndefined();
    expect(response.body.meta.correlationId).toEqual(expect.any(String));
  });

  it("keeps the legacy wrapper under /api and marks it deprecated", async () => {
    const { app, cookie } = await createTestApp(["customers.view"]);

    const response = await request(app)
      .get("/api/customers")
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data.customers.items).toHaveLength(1);
    expect(response.headers.deprecation).toBe("true");
  });

  it("keeps single resources under their key on both prefixes", async () => {
    const { app, cookie } = await createTestApp(["customer_balances.view"]);

    const v1 = await request(app)
      .get("/api/v1/customers/customer-1/statement")
      .set("Cookie", cookie)
      .expect(200);
    const legacy = await request(app)
      .get("/api/customers/customer-1/statement")
      .set("Cookie", cookie)
      .expect(200);

    expect(v1.body.data.statement.balanceTnd).toBe("30.000");
    expect(legacy.body.data.statement.balanceTnd).toBe("30.000");
  });

  describe("customer lifecycle and figures (issue #46)", () => {
    it("deactivates a customer with customers.deactivate", async () => {
      const { app, cookie, customersService } = await createTestApp([
        "customers.deactivate",
      ]);

      await request(app)
        .post("/api/v1/customers/customer-1/deactivate")
        .set("Cookie", cookie)
        .send({ reason: "Doublon" })
        .expect(200);

      expect(customersService.setCustomerActive).toHaveBeenCalledWith(
        "customer-1",
        { isActive: false, reason: "Doublon" },
        expect.objectContaining({ actorUserId: expect.any(String) }),
      );
    });

    it("refuses the deactivation with customers.update alone", async () => {
      const { app, cookie, customersService } = await createTestApp([
        "customers.update",
      ]);

      await request(app)
        .post("/api/v1/customers/customer-1/deactivate")
        .set("Cookie", cookie)
        .send({})
        .expect(403);

      expect(customersService.setCustomerActive).not.toHaveBeenCalled();
    });

    it("serves the figures and the sales page with customer_balances.view", async () => {
      const { app, cookie, customersService } = await createTestApp([
        "customer_balances.view",
      ]);

      await request(app)
        .get("/api/v1/customers/customer-1/summary")
        .set("Cookie", cookie)
        .expect(200);
      await request(app)
        .get("/api/v1/customers/customer-1/sales?page=2&pageSize=10")
        .set("Cookie", cookie)
        .expect(200);

      expect(customersService.getCustomerSummary).toHaveBeenCalledWith(
        "customer-1",
      );
      expect(customersService.listCustomerSales).toHaveBeenCalledWith(
        "customer-1",
        { page: 2, pageSize: 10 },
      );
    });

    it("filters the balances by activity", async () => {
      const { app, cookie, customersService } = await createTestApp([
        "customer_balances.view",
      ]);

      await request(app)
        .get("/api/v1/customer-balances?isActive=false")
        .set("Cookie", cookie)
        .expect(200);

      expect(customersService.listCustomerBalances).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });
  });
});
