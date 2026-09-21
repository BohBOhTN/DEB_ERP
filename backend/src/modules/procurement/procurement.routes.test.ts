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

  const procurementService = {
    listSuppliers: vi.fn().mockResolvedValue({
      items: [
        {
          id: "supplier-1",
          name: "Minoterie Centrale",
          phone: "71111111",
          isActive: true,
          version: 1,
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
      pageCount: 1,
    }),
    createSupplier: vi.fn().mockResolvedValue({
      id: "supplier-1",
      name: "Minoterie Centrale",
      phone: "71111111",
      isActive: true,
      version: 1,
    }),
    updateSupplier: vi.fn().mockResolvedValue({
      id: "supplier-1",
      name: "Minoterie Centrale",
      isActive: false,
      version: 2,
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
    procurement: {
      procurementService: procurementService as never,
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
    procurementService,
  };
}

describe("procurement routes", () => {
  it("rejects anonymous supplier access", async () => {
    const { app } = await createTestApp(["suppliers.view"]);

    const response = await request(app)
      .get("/api/procurement/suppliers")
      .expect(401);

    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects direct API access without the exact supplier permission", async () => {
    const { app, cookie, procurementService } = await createTestApp([]);

    const response = await request(app)
      .get("/api/procurement/suppliers")
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(procurementService.listSuppliers).not.toHaveBeenCalled();
  });

  it("lists suppliers when the user has suppliers.view", async () => {
    const { app, cookie, procurementService } = await createTestApp([
      "suppliers.view",
    ]);

    const response = await request(app)
      .get("/api/procurement/suppliers?search=minoterie&isActive=true")
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data.suppliers.items).toEqual([
      expect.objectContaining({
        id: "supplier-1",
        name: "Minoterie Centrale",
      }),
    ]);
    expect(procurementService.listSuppliers).toHaveBeenCalledWith({
      search: "minoterie",
      isActive: true,
      page: 1,
      pageSize: 25,
    });
  });

  it("creates suppliers when the user has suppliers.create", async () => {
    const { app, cookie, procurementService } = await createTestApp([
      "suppliers.create",
    ]);

    const response = await request(app)
      .post("/api/procurement/suppliers")
      .set("Cookie", cookie)
      .send({
        name: "Minoterie Centrale",
        phone: "71111111",
      })
      .expect(201);

    expect(response.body.data.supplier).toMatchObject({
      id: "supplier-1",
      name: "Minoterie Centrale",
    });
    expect(procurementService.createSupplier).toHaveBeenCalledWith(
      {
        name: "Minoterie Centrale",
        phone: "71111111",
      },
      expect.objectContaining({
        actorUserId: "user-1",
      }),
    );
  });

  it("updates suppliers when the user has suppliers.update", async () => {
    const { app, cookie, procurementService } = await createTestApp([
      "suppliers.update",
    ]);

    const response = await request(app)
      .patch("/api/procurement/suppliers/supplier-1")
      .set("Cookie", cookie)
      .send({
        version: 1,
        isActive: false,
      })
      .expect(200);

    expect(response.body.data.supplier).toMatchObject({
      id: "supplier-1",
      isActive: false,
      version: 2,
    });
    expect(procurementService.updateSupplier).toHaveBeenCalledWith(
      "supplier-1",
      {
        version: 1,
        isActive: false,
      },
      expect.objectContaining({
        actorUserId: "user-1",
      }),
    );
  });
});
