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

  const catalogService = {
    listUnits: vi.fn().mockResolvedValue({
      items: [
        {
          id: "unit-1",
          code: "kilogram",
          name: "Kilogramme",
          symbol: "kg",
          precision: 3,
          isActive: true,
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
      pageCount: 1,
    }),
    createCategory: vi.fn().mockResolvedValue({
      id: "category-1",
      name: "Pains",
      normalizedName: "pains",
      description: null,
      isActive: true,
    }),
    listProducts: vi.fn().mockResolvedValue({
      items: [
        {
          id: "product-1",
          name: "Baguette",
          salePriceTnd: "0.500",
          isStockable: true,
          isActive: true,
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
      pageCount: 1,
    }),
    createRawMaterial: vi.fn().mockResolvedValue({
      id: "raw-material-1",
      name: "Farine",
      isActive: true,
      version: 1,
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
    catalog: {
      catalogService: catalogService as never,
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
    catalogService,
    cookie: login.headers["set-cookie"],
  };
}

describe("catalog routes", () => {
  it("rejects anonymous catalog access", async () => {
    const { app } = await createTestApp(["units.view"]);

    const response = await request(app).get("/api/catalog/units").expect(401);

    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects direct API access without the exact catalog permission", async () => {
    const { app, cookie, catalogService } = await createTestApp([]);

    const response = await request(app)
      .get("/api/catalog/units")
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error).toMatchObject({
      code: "PERMISSION_DENIED",
    });
    expect(catalogService.listUnits).not.toHaveBeenCalled();
  });

  it("lists units when the user has units.view", async () => {
    const { app, cookie, catalogService } = await createTestApp(["units.view"]);

    const response = await request(app)
      .get("/api/catalog/units")
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data.units.items).toEqual([
      expect.objectContaining({
        code: "kilogram",
        name: "Kilogramme",
      }),
    ]);
    expect(catalogService.listUnits).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
    });
  });

  it("creates categories when the user has categories.manage", async () => {
    const { app, cookie, catalogService } = await createTestApp([
      "categories.manage",
    ]);

    const response = await request(app)
      .post("/api/catalog/categories")
      .set("Cookie", cookie)
      .send({
        name: "Pains",
      })
      .expect(201);

    expect(response.body.data.category).toMatchObject({
      id: "category-1",
      name: "Pains",
    });
    expect(catalogService.createCategory).toHaveBeenCalledWith(
      {
        name: "Pains",
      },
      expect.objectContaining({
        actorUserId: "user-1",
      }),
    );
  });

  it("lists products when the user has products.view", async () => {
    const { app, cookie, catalogService } = await createTestApp([
      "products.view",
    ]);

    const response = await request(app)
      .get("/api/catalog/products")
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data.products.items).toEqual([
      expect.objectContaining({
        id: "product-1",
        name: "Baguette",
      }),
    ]);
    expect(catalogService.listProducts).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
    });
  });

  it("creates raw materials when the user has raw_materials.create", async () => {
    const { app, cookie, catalogService } = await createTestApp([
      "raw_materials.create",
    ]);

    const response = await request(app)
      .post("/api/catalog/raw-materials")
      .set("Cookie", cookie)
      .send({
        name: "Farine",
        baseUnitId: "unit-1",
      })
      .expect(201);

    expect(response.body.data.rawMaterial).toMatchObject({
      id: "raw-material-1",
      name: "Farine",
    });
    expect(catalogService.createRawMaterial).toHaveBeenCalledWith(
      {
        name: "Farine",
        baseUnitId: "unit-1",
        conversions: [],
      },
      expect.objectContaining({
        actorUserId: "user-1",
      }),
    );
  });
});
