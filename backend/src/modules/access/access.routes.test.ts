import request from "supertest";
import { describe, expect, it } from "vitest";
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

  const accessService = {
    listPermissions: async () => [
      {
        key: "roles.view",
        module: "Roles",
        labelFr: "roles.view",
        descriptionFr: "Voir les roles",
      },
    ],
    listRoles: async () => [
      {
        id: "role-1",
        name: "Gestion",
        description: null,
        isActive: true,
        isSystem: false,
        systemKey: null,
        permissions: [{ permissionKey: "roles.view" }],
      },
    ],
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
    access: {
      accessService: accessService as never,
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
    login,
  };
}

describe("access routes", () => {
  it("rejects anonymous access before permission checks", async () => {
    const { app } = await createTestApp(["roles.view"]);

    const response = await request(app).get("/api/access/roles").expect(401);

    expect(response.body.error).toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
    });
  });

  it("rejects direct API access when the user lacks the action permission", async () => {
    const { app, cookie, login } = await createTestApp([]);

    expect(login.body.data.user.effectivePermissions).toEqual([]);

    const response = await request(app)
      .get("/api/access/roles")
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error).toMatchObject({
      code: "PERMISSION_DENIED",
      message: "Vous n'avez pas l'autorisation nécessaire.",
    });
  });

  it("allows role listing when the user has the exact permission", async () => {
    const { app, cookie, login } = await createTestApp(["roles.view"]);

    expect(login.body.data.user.effectivePermissions).toEqual(["roles.view"]);

    const response = await request(app)
      .get("/api/access/roles")
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data.roles).toEqual([
      {
        id: "role-1",
        name: "Gestion",
        description: null,
        isActive: true,
        isSystem: false,
        systemKey: null,
        permissionKeys: ["roles.view"],
      },
    ]);
  });
});
