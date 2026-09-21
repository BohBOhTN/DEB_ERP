import { InventoryItemType } from "@prisma/client";
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

  const inventoryService = {
    listBalances: vi.fn().mockResolvedValue([
      {
        itemType: "PRODUCT",
        itemId: "product-1",
        itemName: "Baguette",
        unitName: "Piece",
        quantity: "-2",
        isNegative: true,
      },
    ]),
    listMovements: vi.fn().mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      pageCount: 0,
    }),
    postAdjustment: vi.fn().mockResolvedValue({
      movement: {
        id: "movement-1",
      },
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
    inventory: {
      inventoryService: inventoryService as never,
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
    inventoryService,
  };
}

describe("inventory routes", () => {
  it("rejects anonymous inventory access", async () => {
    const { app } = await createTestApp(["inventory.view"]);

    const response = await request(app)
      .get("/api/inventory/balances")
      .expect(401);

    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects direct API access without the exact inventory permission", async () => {
    const { app, cookie, inventoryService } = await createTestApp([]);

    const response = await request(app)
      .get("/api/inventory/balances")
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(inventoryService.listBalances).not.toHaveBeenCalled();
  });

  it("lists balances when the user has inventory.view", async () => {
    const { app, cookie } = await createTestApp(["inventory.view"]);

    const response = await request(app)
      .get("/api/inventory/balances")
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data.balances).toEqual([
      expect.objectContaining({
        itemName: "Baguette",
        isNegative: true,
      }),
    ]);
  });

  it("requires an idempotency key for adjustments", async () => {
    const { app, cookie } = await createTestApp(["inventory.adjust"]);

    const response = await request(app)
      .post("/api/inventory/adjustments")
      .set("Cookie", cookie)
      .send({
        itemType: InventoryItemType.PRODUCT,
        itemId: "product-1",
        quantityDelta: "1",
        reason: "Correction",
      })
      .expect(400);

    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("posts adjustments with inventory.adjust and an idempotency key", async () => {
    const { app, cookie, inventoryService } = await createTestApp([
      "inventory.adjust",
    ]);

    const response = await request(app)
      .post("/api/inventory/adjustments")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "adjustment-1")
      .send({
        itemType: InventoryItemType.PRODUCT,
        itemId: "product-1",
        quantityDelta: "1",
        reason: "Correction",
      })
      .expect(201);

    expect(response.body.data.movement.id).toBe("movement-1");
    expect(inventoryService.postAdjustment).toHaveBeenCalledWith(
      {
        itemType: InventoryItemType.PRODUCT,
        itemId: "product-1",
        quantityDelta: "1",
        reason: "Correction",
        idempotencyKey: "adjustment-1",
      },
      expect.objectContaining({
        actorUserId: "user-1",
      }),
    );
  });
});
