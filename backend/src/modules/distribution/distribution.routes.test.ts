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
});
