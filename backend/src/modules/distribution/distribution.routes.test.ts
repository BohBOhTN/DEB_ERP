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

function emptyPage() {
  return { items: [], page: 1, pageSize: 25, total: 0, pageCount: 0 };
}

const saleBody = {
  distributorId: "distributor-1",
  soldAt: "2026-09-22T09:00:00.000Z",
  lines: [{ productId: "product-1", quantity: "10", unitPriceTnd: "2.000" }],
};

const dispatchBody = {
  distributorId: "distributor-1",
  dispatchedAt: "2026-09-22T06:00:00.000Z",
  lines: [{ productId: "product-1", quantity: "100" }],
};

const settlementBody = {
  dispatchId: "dispatch-1",
  settledAt: "2026-09-22T18:00:00.000Z",
  lines: [
    { dispatchLineId: "line-1", soldQuantity: "80", unitPriceTnd: "2.000" },
  ],
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

  const distributionService = {
    listDistributors: vi.fn().mockResolvedValue({
      items: [{ id: "distributor-1", name: "Distributeur Nord" }],
      page: 1,
      pageSize: 25,
      total: 1,
      pageCount: 1,
    }),
    createDistributor: vi.fn().mockResolvedValue({ id: "distributor-1" }),
    updateDistributor: vi.fn().mockResolvedValue({ id: "distributor-1" }),
    postDirectSale: vi.fn().mockResolvedValue({ sale: { id: "sale-1" } }),
    listDispatches: vi.fn().mockResolvedValue(emptyPage()),
    getDispatch: vi.fn().mockResolvedValue({ id: "dispatch-1" }),
    dispatchConsignment: vi
      .fn()
      .mockResolvedValue({ dispatch: { id: "dispatch-1" } }),
    postSettlement: vi
      .fn()
      .mockResolvedValue({ settlement: { id: "settlement-1" } }),
    listCustody: vi.fn().mockResolvedValue({ items: [], discrepancies: [] }),
    listDistributorBalances: vi.fn().mockResolvedValue(emptyPage()),
    getDistributorStatement: vi
      .fn()
      .mockResolvedValue({ distributor: { id: "distributor-1" } }),
    listDistributorPayments: vi.fn().mockResolvedValue(emptyPage()),
    createDistributorPayment: vi
      .fn()
      .mockResolvedValue({ payment: { id: "payment-1" }, allocations: [] }),
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
    distribution: {
      distributionService: distributionService as never,
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
    distributionService,
  };
}

describe("distribution routes", () => {
  it("rejects anonymous distributor access", async () => {
    const { app } = await createTestApp(["distributors.view"]);

    const response = await request(app).get("/api/distributors").expect(401);

    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects listing distributors without distributors.view", async () => {
    const { app, cookie, distributionService } = await createTestApp([]);

    const response = await request(app)
      .get("/api/distributors")
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(distributionService.listDistributors).not.toHaveBeenCalled();
  });

  it("lists distributors with distributors.view", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distributors.view",
    ]);

    await request(app)
      .get("/api/distributors?search=nord&isActive=true")
      .set("Cookie", cookie)
      .expect(200);

    expect(distributionService.listDistributors).toHaveBeenCalledWith(
      expect.objectContaining({ search: "nord", isActive: true }),
    );
  });

  it("rejects creating a distributor without distributors.create", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distributors.view",
    ]);

    const response = await request(app)
      .post("/api/distributors")
      .set("Cookie", cookie)
      .send({ name: "Distributeur Nord" })
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(distributionService.createDistributor).not.toHaveBeenCalled();
  });

  it("requires a distributor name", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distributors.create",
    ]);

    await request(app)
      .post("/api/distributors")
      .set("Cookie", cookie)
      .send({ name: "   " })
      .expect(400);

    expect(distributionService.createDistributor).not.toHaveBeenCalled();
  });

  it("creates a distributor with distributors.create", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distributors.create",
    ]);

    await request(app)
      .post("/api/distributors")
      .set("Cookie", cookie)
      .send({ name: "Distributeur Nord", phone: "20000000" })
      .expect(201);

    expect(distributionService.createDistributor).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Distributeur Nord" }),
      expect.objectContaining({ actorUserId: "user-1" }),
    );
  });

  it("rejects updating a distributor without distributors.update", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distributors.view",
    ]);

    const response = await request(app)
      .patch("/api/distributors/distributor-1")
      .set("Cookie", cookie)
      .send({ version: 1, isActive: false })
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(distributionService.updateDistributor).not.toHaveBeenCalled();
  });

  it("requires a version to update a distributor", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distributors.update",
    ]);

    await request(app)
      .patch("/api/distributors/distributor-1")
      .set("Cookie", cookie)
      .send({ isActive: false })
      .expect(400);

    expect(distributionService.updateDistributor).not.toHaveBeenCalled();
  });

  it("deactivates a distributor with distributors.update", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distributors.update",
    ]);

    await request(app)
      .patch("/api/distributors/distributor-1")
      .set("Cookie", cookie)
      .send({ version: 1, isActive: false })
      .expect(200);

    expect(distributionService.updateDistributor).toHaveBeenCalledWith(
      "distributor-1",
      expect.objectContaining({ version: 1, isActive: false }),
      expect.objectContaining({ actorUserId: "user-1" }),
    );
  });

  it("rejects a direct sale without distribution.direct_sale", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distributors.view",
    ]);

    const response = await request(app)
      .post("/api/distributor-sales")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "sale-1")
      .send(saleBody)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(distributionService.postDirectSale).not.toHaveBeenCalled();
  });

  it("requires an idempotency key for a direct sale", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distribution.direct_sale",
    ]);

    const response = await request(app)
      .post("/api/distributor-sales")
      .set("Cookie", cookie)
      .send(saleBody)
      .expect(400);

    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(distributionService.postDirectSale).not.toHaveBeenCalled();
  });

  it("posts a direct sale with distribution.direct_sale", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distribution.direct_sale",
    ]);

    await request(app)
      .post("/api/distributor-sales")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "sale-1")
      .send(saleBody)
      .expect(201);

    expect(distributionService.postDirectSale).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "sale-1" }),
      expect.objectContaining({ actorUserId: "user-1" }),
    );
  });

  it("rejects a dispatch without distribution.dispatch", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distribution.custody.view",
    ]);

    const response = await request(app)
      .post("/api/distributor-dispatches")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "dispatch-1")
      .send(dispatchBody)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(distributionService.dispatchConsignment).not.toHaveBeenCalled();
  });

  it("posts a dispatch with distribution.dispatch", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distribution.dispatch",
    ]);

    await request(app)
      .post("/api/distributor-dispatches")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "dispatch-1")
      .send(dispatchBody)
      .expect(201);

    expect(distributionService.dispatchConsignment).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "dispatch-1" }),
      expect.objectContaining({ actorUserId: "user-1" }),
    );
  });

  // Dispatching must not let a user read custody, and reading custody must not
  // let a user dispatch.
  it("rejects reading custody without distribution.custody.view", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distribution.dispatch",
    ]);

    const response = await request(app)
      .get("/api/distributor-custody")
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(distributionService.listCustody).not.toHaveBeenCalled();
  });

  it("reads custody and dispatches with distribution.custody.view", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distribution.custody.view",
    ]);

    await request(app)
      .get("/api/distributor-custody")
      .set("Cookie", cookie)
      .expect(200);
    await request(app)
      .get("/api/distributor-dispatches?status=OPEN")
      .set("Cookie", cookie)
      .expect(200);
    await request(app)
      .get("/api/distributor-dispatches/dispatch-1")
      .set("Cookie", cookie)
      .expect(200);

    expect(distributionService.listCustody).toHaveBeenCalled();
    expect(distributionService.listDispatches).toHaveBeenCalledWith(
      expect.objectContaining({ status: "OPEN" }),
    );
    expect(distributionService.getDispatch).toHaveBeenCalledWith("dispatch-1");
  });

  it("rejects a settlement without distribution.settle", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distribution.dispatch",
      "distribution.custody.view",
    ]);

    const response = await request(app)
      .post("/api/distributor-settlements")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "settlement-1")
      .send(settlementBody)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(distributionService.postSettlement).not.toHaveBeenCalled();
  });

  it("requires an idempotency key for a settlement", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distribution.settle",
    ]);

    const response = await request(app)
      .post("/api/distributor-settlements")
      .set("Cookie", cookie)
      .send(settlementBody)
      .expect(400);

    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(distributionService.postSettlement).not.toHaveBeenCalled();
  });

  it("posts a settlement with distribution.settle", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distribution.settle",
    ]);

    await request(app)
      .post("/api/distributor-settlements")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "settlement-1")
      .send(settlementBody)
      .expect(201);

    expect(distributionService.postSettlement).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "settlement-1" }),
      expect.objectContaining({ actorUserId: "user-1" }),
    );
  });

  it("rejects balances and statements without distribution.balances.view", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distributors.view",
    ]);

    await request(app)
      .get("/api/distributor-balances")
      .set("Cookie", cookie)
      .expect(403);
    await request(app)
      .get("/api/distributors/distributor-1/statement")
      .set("Cookie", cookie)
      .expect(403);

    expect(distributionService.listDistributorBalances).not.toHaveBeenCalled();
    expect(distributionService.getDistributorStatement).not.toHaveBeenCalled();
  });

  it("reads balances and statements with distribution.balances.view", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distribution.balances.view",
    ]);

    await request(app)
      .get("/api/distributor-balances")
      .set("Cookie", cookie)
      .expect(200);
    await request(app)
      .get("/api/distributors/distributor-1/statement")
      .set("Cookie", cookie)
      .expect(200);

    expect(distributionService.listDistributorBalances).toHaveBeenCalled();
    expect(distributionService.getDistributorStatement).toHaveBeenCalledWith(
      "distributor-1",
      expect.any(Object),
    );
  });

  it("rejects listing distributor payments without distributor_payments.view", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distributor_payments.create",
    ]);

    const response = await request(app)
      .get("/api/distributor-payments")
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(distributionService.listDistributorPayments).not.toHaveBeenCalled();
  });

  it("rejects creating a distributor payment without distributor_payments.create", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distributor_payments.view",
    ]);

    const response = await request(app)
      .post("/api/distributor-payments")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "payment-1")
      .send({
        distributorId: "distributor-1",
        paidAt: "2026-09-23T09:00:00.000Z",
        amountTnd: "30.000",
      })
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(distributionService.createDistributorPayment).not.toHaveBeenCalled();
  });

  it("creates a distributor payment with distributor_payments.create", async () => {
    const { app, cookie, distributionService } = await createTestApp([
      "distributor_payments.create",
    ]);

    await request(app)
      .post("/api/distributor-payments")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "payment-1")
      .send({
        distributorId: "distributor-1",
        paidAt: "2026-09-23T09:00:00.000Z",
        amountTnd: "30.000",
      })
      .expect(201);

    expect(distributionService.createDistributorPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amountTnd: "30.000",
        idempotencyKey: "payment-1",
      }),
      expect.objectContaining({ actorUserId: "user-1" }),
    );
  });
});
