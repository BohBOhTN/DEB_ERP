import { describe, expect, it } from "vitest";
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

describe("AuthService", () => {
  it("authenticates an active user and returns no password material", async () => {
    const repository = new InMemoryAuthRepository();
    const service = new AuthService(repository, 30);
    await repository.createUser({
      email: "admin@example.com",
      displayName: "Admin",
      passwordHash: await hashPassword("correct-password"),
    });

    const result = await service.login({
      email: "ADMIN@example.com ",
      password: "correct-password",
    });

    expect(result.user).toEqual({
      id: "user-1",
      email: "admin@example.com",
      displayName: "Admin",
      effectivePermissions: [],
    });
    expect(result.sessionToken).toEqual(expect.any(String));
    expect(repository.sessions.size).toBe(1);
  });

  it("rejects invalid passwords with a generic authentication error", async () => {
    const repository = new InMemoryAuthRepository();
    const service = new AuthService(repository, 30);
    await repository.createUser({
      email: "admin@example.com",
      displayName: "Admin",
      passwordHash: await hashPassword("correct-password"),
    });

    await expect(
      service.login({
        email: "admin@example.com",
        password: "wrong-password",
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: "AUTHENTICATION_REQUIRED",
      message: "Identifiants invalides.",
    });
  });

  it("rejects inactive users with the same generic login error", async () => {
    const repository = new InMemoryAuthRepository();
    const service = new AuthService(repository, 30);
    const user = await repository.createUser({
      email: "admin@example.com",
      displayName: "Admin",
      passwordHash: await hashPassword("correct-password"),
    });
    user.isActive = false;

    await expect(
      service.login({
        email: "admin@example.com",
        password: "correct-password",
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: "AUTHENTICATION_REQUIRED",
      message: "Identifiants invalides.",
    });
  });
});
