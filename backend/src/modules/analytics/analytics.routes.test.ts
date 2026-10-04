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
    email: "owner@example.com",
    displayName: "Owner",
    passwordHash: await hashPassword("correct-password"),
  });
  repository.permissions.set(user.id, permissionKeys);

  const analyticsService = {
    getOverview: vi.fn().mockResolvedValue({ revenue: { totalTnd: "0.000" } }),
    getFrequency: vi.fn().mockResolvedValue({ sales: { count: 0 } }),
    getProducts: vi.fn().mockResolvedValue({ items: [] }),
    getCustomers: vi.fn().mockResolvedValue({ top: [] }),
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
    analytics: {
      analyticsService: analyticsService as never,
    },
  });

  const login = await request(app)
    .post("/api/auth/login")
    .send({
      email: "owner@example.com",
      password: "correct-password",
    })
    .expect(200);

  return {
    app,
    cookie: login.headers["set-cookie"],
    analyticsService,
  };
}

const endpoints = ["overview", "frequency", "products", "customers"] as const;

describe("analytics routes", () => {
  it("rejects an anonymous caller", async () => {
    const { app } = await createTestApp(["analytics.view"]);

    const response = await request(app)
      .get("/api/v1/analytics/overview")
      .expect(401);

    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it.each(endpoints)("refuses %s without analytics.view", async (endpoint) => {
    const { app, cookie, analyticsService } = await createTestApp([
      "pos.access",
      "customers.view",
      "margin.view",
    ]);

    const response = await request(app)
      .get(`/api/v1/analytics/${endpoint}`)
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(analyticsService.getOverview).not.toHaveBeenCalled();
    expect(analyticsService.getCustomers).not.toHaveBeenCalled();
  });

  it("answers the overview under its key with the resolved period and the caller's permissions", async () => {
    const { app, cookie, analyticsService } = await createTestApp([
      "analytics.view",
      "margin.view",
    ]);

    const response = await request(app)
      .get("/api/v1/analytics/overview?from=2026-09-01&to=2026-09-30")
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data.overview).toEqual({
      revenue: { totalTnd: "0.000" },
    });
    expect(response.body.meta.correlationId).toEqual(expect.any(String));
    const params = analyticsService.getOverview.mock.calls[0]?.[0] as {
      period: { from: string; to: string; days: number };
      permissions: Set<string>;
    };
    expect(params.period).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
      days: 30,
    });
    expect([...params.permissions].sort()).toEqual([
      "analytics.view",
      "margin.view",
    ]);
  });

  it("serves frequency and products with analytics.view alone", async () => {
    const { app, cookie, analyticsService } = await createTestApp([
      "analytics.view",
    ]);

    const frequency = await request(app)
      .get("/api/v1/analytics/frequency")
      .set("Cookie", cookie)
      .expect(200);
    const products = await request(app)
      .get("/api/v1/analytics/products")
      .set("Cookie", cookie)
      .expect(200);

    expect(frequency.body.data.frequency).toEqual({ sales: { count: 0 } });
    expect(products.body.data.products).toEqual({ items: [] });
    expect(analyticsService.getFrequency).toHaveBeenCalledTimes(1);
  });

  it("keeps the customer analysis behind customers.view as well", async () => {
    const denied = await createTestApp(["analytics.view"]);
    await request(denied.app)
      .get("/api/v1/analytics/customers")
      .set("Cookie", denied.cookie)
      .expect(403);
    expect(denied.analyticsService.getCustomers).not.toHaveBeenCalled();

    const allowed = await createTestApp(["analytics.view", "customers.view"]);
    const response = await request(allowed.app)
      .get("/api/v1/analytics/customers")
      .set("Cookie", allowed.cookie)
      .expect(200);

    expect(response.body.data.customers).toEqual({ top: [] });
  });

  it("refuses a malformed date, a reversed period and a period that is too long", async () => {
    const { app, cookie, analyticsService } = await createTestApp([
      "analytics.view",
    ]);
    const get = (query: string) =>
      request(app)
        .get(`/api/v1/analytics/overview?${query}`)
        .set("Cookie", cookie)
        .expect(400);

    const malformed = await get("from=01/09/2026");
    const reversed = await get("from=2026-09-30&to=2026-09-01");
    const tooLong = await get("from=2024-01-01&to=2026-09-01");

    expect(malformed.body.error.code).toBe("VALIDATION_ERROR");
    expect(reversed.body.error.fieldErrors).toEqual({
      to: "La date de fin doit suivre la date de début.",
    });
    expect(tooLong.body.error.fieldErrors).toEqual({
      from: "La période ne peut pas dépasser 366 jours.",
    });
    expect(analyticsService.getOverview).not.toHaveBeenCalled();
  });
});
