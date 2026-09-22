import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { AuthService } from "./auth.service.js";
import type {
  AuthRepository,
  StoredSession,
  StoredUser,
} from "./auth.types.js";
import { hashPassword } from "./password.service.js";

class InMemoryAuthRepository implements AuthRepository {
  public users = new Map<string, StoredUser>();
  public sessions = new Map<string, StoredSession>();
  public permissions = new Map<string, string[]>();

  public async findUserByEmail(email: string): Promise<StoredUser | null> {
    return this.users.get(email) ?? null;
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

  public async findEffectivePermissionKeys(userId: string): Promise<string[]> {
    return this.permissions.get(userId) ?? [];
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

async function createTestApp() {
  const repository = new InMemoryAuthRepository();
  const authService = new AuthService(repository, 30);
  await repository.createUser({
    email: "admin@example.com",
    displayName: "Admin",
    passwordHash: await hashPassword("correct-password"),
  });

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
  });

  return { app, repository };
}

describe("auth routes", () => {
  it("logs in, reads current user, and logs out", async () => {
    const { app } = await createTestApp();

    const login = await request(app)
      .post("/api/auth/login")
      .send({
        email: "admin@example.com",
        password: "correct-password",
      })
      .expect(200);

    const cookie = login.headers["set-cookie"];
    expect(cookie[0]).toContain("HttpOnly");
    expect(login.body.data.user).toMatchObject({
      email: "admin@example.com",
      displayName: "Admin",
      effectivePermissions: [],
    });

    const me = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie)
      .expect(200);

    expect(me.body.data.user.email).toBe("admin@example.com");

    await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie)
      .expect(200);

    await request(app).get("/api/auth/me").set("Cookie", cookie).expect(401);
  });

  it("rejects anonymous protected requests", async () => {
    const { app } = await createTestApp();

    const response = await request(app).get("/api/auth/me").expect(401);

    expect(response.body.error).toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      message: "Votre session n'est plus valide.",
    });
  });

  it("uses a generic French login error for invalid credentials", async () => {
    const { app } = await createTestApp();

    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: "missing@example.com",
        password: "wrong-password",
      })
      .expect(401);

    expect(response.body.error).toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      message: "Identifiants invalides.",
    });
  });

  it("rejects an existing session after the user is deactivated", async () => {
    const { app, repository } = await createTestApp();
    const login = await request(app)
      .post("/api/auth/login")
      .send({
        email: "admin@example.com",
        password: "correct-password",
      })
      .expect(200);

    const user = repository.users.get("admin@example.com");

    if (!user) {
      throw new Error("missing user");
    }

    user.isActive = false;

    await request(app)
      .get("/api/auth/me")
      .set("Cookie", login.headers["set-cookie"])
      .expect(401);
  });
});
