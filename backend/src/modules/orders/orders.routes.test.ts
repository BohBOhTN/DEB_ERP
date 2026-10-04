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

const orderPayload = {
  customerId: "customer-1",
  requestedFulfillmentAt: "2026-09-23T09:00:00.000Z",
  lines: [{ productId: "product-1", quantity: "16" }],
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

  const ordersService = {
    listOrders: vi.fn().mockResolvedValue({
      items: [{ id: "order-1", reference: "CMD-000001" }],
      page: 1,
      pageSize: 25,
      total: 1,
      pageCount: 1,
    }),
    getOrder: vi.fn().mockResolvedValue({ id: "order-1" }),
    summarizeOrders: vi.fn().mockResolvedValue({ count: 0 }),
    createOrder: vi.fn().mockResolvedValue({ order: { id: "order-1" } }),
    updateOrder: vi.fn().mockResolvedValue({ order: { id: "order-1" } }),
    changeOrderStatus: vi.fn().mockResolvedValue({ order: { id: "order-1" } }),
    recordOrderAdvance: vi
      .fn()
      .mockResolvedValue({ order: { id: "order-1" }, advance: {} }),
    completeOrder: vi
      .fn()
      .mockResolvedValue({ order: { id: "order-1", saleId: "sale-1" } }),
    cancelOrder: vi.fn().mockResolvedValue({ order: { id: "order-1" } }),
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
    orders: {
      ordersService: ordersService as never,
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
    ordersService,
  };
}

describe("orders routes", () => {
  it("rejects anonymous order access", async () => {
    const { app } = await createTestApp(["orders.view"]);

    const response = await request(app).get("/api/orders").expect(401);

    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects listing orders without orders.view", async () => {
    const { app, cookie, ordersService } = await createTestApp([]);

    const response = await request(app)
      .get("/api/orders")
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(ordersService.listOrders).not.toHaveBeenCalled();
  });

  it("lists the order queue filtered by status and due time", async () => {
    const { app, cookie, ordersService } = await createTestApp(["orders.view"]);

    await request(app)
      .get("/api/orders?status=READY&dueBefore=2026-09-23T23:59:00.000Z")
      .set("Cookie", cookie)
      .expect(200);

    expect(ordersService.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "READY",
        dueBefore: new Date("2026-09-23T23:59:00.000Z"),
      }),
    );
  });

  it("rejects creating an order without orders.create", async () => {
    const { app, cookie, ordersService } = await createTestApp(["orders.view"]);

    const response = await request(app)
      .post("/api/orders")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "order-1")
      .send(orderPayload)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(ordersService.createOrder).not.toHaveBeenCalled();
  });

  it("requires an idempotency key to create an order", async () => {
    const { app, cookie, ordersService } = await createTestApp([
      "orders.create",
    ]);

    const response = await request(app)
      .post("/api/orders")
      .set("Cookie", cookie)
      .send(orderPayload)
      .expect(400);

    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(ordersService.createOrder).not.toHaveBeenCalled();
  });

  it("creates an order with orders.create and an idempotency key", async () => {
    const { app, cookie, ordersService } = await createTestApp([
      "orders.create",
    ]);

    await request(app)
      .post("/api/orders")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "order-1")
      .send(orderPayload)
      .expect(201);

    expect(ordersService.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "customer-1",
        idempotencyKey: "order-1",
      }),
      expect.objectContaining({ actorUserId: "user-1" }),
    );
  });

  // COMPLETED and CANCELLED carry money and stock effects, so the plain status
  // route must not be able to reach them.
  it("rejects reaching COMPLETED through the status route", async () => {
    const { app, cookie, ordersService } = await createTestApp([
      "orders.change_status",
    ]);

    await request(app)
      .post("/api/orders/order-1/status")
      .set("Cookie", cookie)
      .send({ version: 1, status: "COMPLETED" })
      .expect(400);

    expect(ordersService.changeOrderStatus).not.toHaveBeenCalled();
  });

  it("requires both order and customer payment permissions for an advance", async () => {
    const { app, cookie, ordersService } = await createTestApp([
      "orders.update",
    ]);

    const response = await request(app)
      .post("/api/orders/order-1/advances")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "advance-1")
      .send({ amountTnd: "10.000", paidAt: "2026-09-22T09:00:00.000Z" })
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(ordersService.recordOrderAdvance).not.toHaveBeenCalled();
  });

  it("records an advance with both permissions", async () => {
    const { app, cookie, ordersService } = await createTestApp([
      "orders.update",
      "customer_payments.create",
    ]);

    await request(app)
      .post("/api/orders/order-1/advances")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "advance-1")
      .send({ amountTnd: "10.000", paidAt: "2026-09-22T09:00:00.000Z" })
      .expect(201);

    expect(ordersService.recordOrderAdvance).toHaveBeenCalledWith(
      "order-1",
      expect.objectContaining({
        amountTnd: "10.000",
        idempotencyKey: "advance-1",
      }),
      expect.objectContaining({ actorUserId: "user-1" }),
    );
  });

  it("rejects completing an order without orders.complete", async () => {
    const { app, cookie, ordersService } = await createTestApp([
      "orders.view",
      "orders.update",
    ]);

    const response = await request(app)
      .post("/api/orders/order-1/complete")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "complete-1")
      .send({ completedAt: "2026-09-23T09:15:00.000Z", paidAmountTnd: "0" })
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(ordersService.completeOrder).not.toHaveBeenCalled();
  });

  it("requires an idempotency key to complete an order", async () => {
    const { app, cookie, ordersService } = await createTestApp([
      "orders.complete",
    ]);

    const response = await request(app)
      .post("/api/orders/order-1/complete")
      .set("Cookie", cookie)
      .send({ completedAt: "2026-09-23T09:15:00.000Z", paidAmountTnd: "0" })
      .expect(400);

    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(ordersService.completeOrder).not.toHaveBeenCalled();
  });

  it("completes an order with orders.complete", async () => {
    const { app, cookie, ordersService } = await createTestApp([
      "orders.complete",
    ]);

    await request(app)
      .post("/api/orders/order-1/complete")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "complete-1")
      .send({ completedAt: "2026-09-23T09:15:00.000Z", paidAmountTnd: "0" })
      .expect(201);

    expect(ordersService.completeOrder).toHaveBeenCalledWith(
      "order-1",
      expect.objectContaining({ idempotencyKey: "complete-1" }),
      expect.objectContaining({ actorUserId: "user-1" }),
    );
  });

  it("rejects cancelling an order without a reason", async () => {
    const { app, cookie, ordersService } = await createTestApp([
      "orders.cancel",
    ]);

    await request(app)
      .post("/api/orders/order-1/cancel")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "cancel-1")
      .send({ cancelledAt: "2026-09-23T09:15:00.000Z", reason: "   " })
      .expect(400);

    expect(ordersService.cancelOrder).not.toHaveBeenCalled();
  });

  it("cancels an order with a reason and advance disposition", async () => {
    const { app, cookie, ordersService } = await createTestApp([
      "orders.cancel",
    ]);

    await request(app)
      .post("/api/orders/order-1/cancel")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "cancel-1")
      .send({
        cancelledAt: "2026-09-23T09:15:00.000Z",
        reason: "Client absent",
        advanceDisposition: "REFUNDED",
      })
      .expect(200);

    expect(ordersService.cancelOrder).toHaveBeenCalledWith(
      "order-1",
      expect.objectContaining({
        reason: "Client absent",
        advanceDisposition: "REFUNDED",
      }),
      expect.objectContaining({ actorUserId: "user-1" }),
    );
  });

  describe("order queue figures and completion amount (issue #45)", () => {
    it("serves the summary with the list's filters", async () => {
      const { app, cookie, ordersService } = await createTestApp([
        "orders.view",
      ]);

      await request(app)
        .get(
          "/api/v1/orders/summary?customerId=customer-1&dueAfter=2026-09-24T00:00:00.000Z&q=CMD",
        )
        .set("Cookie", cookie)
        .expect(200);

      expect(ordersService.summarizeOrders).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: "customer-1",
          dueAfter: new Date("2026-09-24T00:00:00.000Z"),
          search: "CMD",
        }),
      );
    });

    // Issue 015: the queue and its figures over every open order.
    it("passes the open filter to the list and to the summary", async () => {
      const { app, cookie, ordersService } = await createTestApp([
        "orders.view",
      ]);

      await request(app)
        .get("/api/v1/orders?open=true")
        .set("Cookie", cookie)
        .expect(200);
      await request(app)
        .get("/api/v1/orders/summary?open=true")
        .set("Cookie", cookie)
        .expect(200);
      await request(app)
        .get("/api/v1/orders?open=yes")
        .set("Cookie", cookie)
        .expect(400);

      expect(ordersService.listOrders).toHaveBeenCalledTimes(1);
      expect(ordersService.listOrders).toHaveBeenCalledWith(
        expect.objectContaining({ open: true }),
      );
      expect(ordersService.summarizeOrders).toHaveBeenCalledWith(
        expect.objectContaining({ open: true }),
      );
    });

    it("refuses the summary without orders.view", async () => {
      const { app, cookie, ordersService } = await createTestApp([
        "orders.create",
      ]);

      await request(app)
        .get("/api/v1/orders/summary")
        .set("Cookie", cookie)
        .expect(403);

      expect(ordersService.summarizeOrders).not.toHaveBeenCalled();
    });

    it("refuses a completion that does not state the amount paid", async () => {
      const { app, cookie, ordersService } = await createTestApp([
        "orders.complete",
      ]);

      const response = await request(app)
        .post("/api/v1/orders/order-1/complete")
        .set("Cookie", cookie)
        .set("Idempotency-Key", "complete-1")
        .send({ completedAt: "2026-09-24T10:00:00.000Z" })
        .expect(400);

      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(ordersService.completeOrder).not.toHaveBeenCalled();
    });
  });
});
