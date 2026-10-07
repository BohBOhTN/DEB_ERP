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
    createProduct: vi.fn(),
    setProductImage: vi.fn().mockResolvedValue({
      id: "product-1",
      name: "Baguette",
      imageKey: "products/abc.webp",
    }),
    removeProductImage: vi.fn().mockResolvedValue({
      id: "product-1",
      name: "Baguette",
      imageKey: null,
    }),
    getProductPriceHistory: vi.fn(),
    getRawMaterialPriceHistory: vi.fn(),
    listProducts: vi.fn().mockResolvedValue({
      items: [
        {
          id: "product-1",
          name: "Baguette",
          salePriceTnd: "0.500",
          approximateCostTnd: "0.300",
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
    // Issue 008: the cost is the owner's figure, absent without margin.view.
    expect(response.body.data.products.items[0]).not.toHaveProperty(
      "approximateCostTnd",
    );
    expect(catalogService.listProducts).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
    });
  });

  it("shows the approximate cost with margin.view and stores an empty one as null (issue 008)", async () => {
    const { app, cookie, catalogService } = await createTestApp([
      "products.view",
      "products.create",
      "margin.view",
    ]);
    catalogService.createProduct = vi
      .fn()
      .mockImplementation(async (body: Record<string, unknown>) => ({
        id: "product-2",
        ...body,
      }));

    const listed = await request(app)
      .get("/api/catalog/products")
      .set("Cookie", cookie)
      .expect(200);
    expect(listed.body.data.products.items[0]).toMatchObject({
      approximateCostTnd: "0.300",
    });

    const created = await request(app)
      .post("/api/catalog/products")
      .set("Cookie", cookie)
      .send({
        name: "Croissant",
        categoryId: "category-1",
        baseUnitId: "unit-1",
        salePriceTnd: "1.000",
        approximateCostTnd: "",
        isStockable: true,
      })
      .expect(201);
    expect(catalogService.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ approximateCostTnd: null }),
      expect.anything(),
    );
    expect(created.body.data.product).toMatchObject({
      approximateCostTnd: null,
    });

    await request(app)
      .post("/api/catalog/products")
      .set("Cookie", cookie)
      .send({
        name: "Pain",
        categoryId: "category-1",
        baseUnitId: "unit-1",
        salePriceTnd: "1.200",
        approximateCostTnd: "0.8",
        isStockable: true,
      })
      .expect(201);
    expect(catalogService.createProduct).toHaveBeenLastCalledWith(
      expect.objectContaining({ approximateCostTnd: "0.8" }),
      expect.anything(),
    );
  });

  // Issue 019: the resale flag travels through the create, the update and
  // the list filter.
  it("passes the resale flag on create and filters the list on it", async () => {
    const { app, cookie, catalogService } = await createTestApp([
      "products.view",
      "products.create",
    ]);
    catalogService.createProduct = vi
      .fn()
      .mockResolvedValue({ id: "product-3", name: "Eau 1,5 L" });

    await request(app)
      .post("/api/catalog/products")
      .set("Cookie", cookie)
      .send({
        name: "Eau 1,5 L",
        categoryId: "category-1",
        baseUnitId: "unit-1",
        salePriceTnd: "1.200",
        isStockable: true,
        isResale: true,
      })
      .expect(201);
    expect(catalogService.createProduct).toHaveBeenLastCalledWith(
      expect.objectContaining({ isResale: true }),
      expect.anything(),
    );

    await request(app)
      .get("/api/catalog/products?isResale=true&isActive=true")
      .set("Cookie", cookie)
      .expect(200);
    expect(catalogService.listProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ isResale: true, isActive: true }),
    );
  });

  // Issue 023: the prices of an item over time, the purchases behind the
  // purchases permission.
  it("serves a product's price history, with the purchases only alongside purchases.view", async () => {
    const withoutPurchases = await createTestApp(["products.view"]);
    withoutPurchases.catalogService.getProductPriceHistory = vi
      .fn()
      .mockResolvedValue({ salePrices: [], purchasePrices: null });
    await request(withoutPurchases.app)
      .get("/api/catalog/products/product-1/price-history")
      .set("Cookie", withoutPurchases.cookie)
      .expect(200);
    expect(
      withoutPurchases.catalogService.getProductPriceHistory,
    ).toHaveBeenCalledWith("product-1", { withPurchases: false });

    const withPurchases = await createTestApp([
      "products.view",
      "purchases.view",
    ]);
    withPurchases.catalogService.getProductPriceHistory = vi
      .fn()
      .mockResolvedValue({ salePrices: [], purchasePrices: [] });
    const response = await request(withPurchases.app)
      .get("/api/catalog/products/product-1/price-history")
      .set("Cookie", withPurchases.cookie)
      .expect(200);
    expect(response.body.data.priceHistory).toEqual({
      salePrices: [],
      purchasePrices: [],
    });
    expect(
      withPurchases.catalogService.getProductPriceHistory,
    ).toHaveBeenCalledWith("product-1", { withPurchases: true });
  });

  it("keeps a raw material's price history behind purchases.view as well", async () => {
    const denied = await createTestApp(["raw_materials.view"]);
    await request(denied.app)
      .get("/api/catalog/raw-materials/raw-1/price-history")
      .set("Cookie", denied.cookie)
      .expect(403);

    const allowed = await createTestApp([
      "raw_materials.view",
      "purchases.view",
    ]);
    allowed.catalogService.getRawMaterialPriceHistory = vi
      .fn()
      .mockResolvedValue({ rawMaterialId: "raw-1", purchasePrices: [] });
    const response = await request(allowed.app)
      .get("/api/catalog/raw-materials/raw-1/price-history")
      .set("Cookie", allowed.cookie)
      .expect(200);
    expect(response.body.data.priceHistory.purchasePrices).toEqual([]);
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
  // Issue #64: the photo route takes one multipart file under products.update,
  // hands its bytes to the service, refuses a missing file and an oversized
  // one with the API's own errors, and answers with the photo's public path.
  it("replaces and removes a product photo with products.update", async () => {
    const { app, cookie, catalogService } = await createTestApp([
      "products.view",
      "products.update",
    ]);
    const bytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
    ]);

    const replaced = await request(app)
      .put("/api/catalog/products/product-1/image")
      .set("Cookie", cookie)
      .attach("file", bytes, "photo.png")
      .expect(200);
    expect(catalogService.setProductImage).toHaveBeenCalledWith(
      "product-1",
      expect.any(Buffer),
      expect.anything(),
    );
    expect(
      (catalogService.setProductImage.mock.calls[0]?.[1] as Buffer).equals(
        bytes,
      ),
    ).toBe(true);
    expect(replaced.body.data.product).toMatchObject({
      imageUrl: "/media/products/abc.webp",
    });

    const missing = await request(app)
      .put("/api/catalog/products/product-1/image")
      .set("Cookie", cookie)
      .expect(400);
    expect(missing.body.error.code).toBe("PRODUCT_IMAGE_REQUIRED");

    const huge = await request(app)
      .put("/api/catalog/products/product-1/image")
      .set("Cookie", cookie)
      .attach("file", Buffer.alloc(5 * 1024 * 1024 + 1, 1), "huge.png")
      .expect(413);
    expect(huge.body.error.code).toBe("PRODUCT_IMAGE_TOO_LARGE");

    const removed = await request(app)
      .delete("/api/catalog/products/product-1/image")
      .set("Cookie", cookie)
      .expect(200);
    expect(catalogService.removeProductImage).toHaveBeenCalledWith(
      "product-1",
      expect.anything(),
    );
    expect(removed.body.data.product).toMatchObject({ imageUrl: null });
  });

  it("refuses the photo routes without products.update", async () => {
    const { app, cookie, catalogService } = await createTestApp([
      "products.view",
    ]);

    await request(app)
      .put("/api/catalog/products/product-1/image")
      .set("Cookie", cookie)
      .attach("file", Buffer.from("x"), "photo.png")
      .expect(403);
    await request(app)
      .delete("/api/catalog/products/product-1/image")
      .set("Cookie", cookie)
      .expect(403);
    expect(catalogService.setProductImage).not.toHaveBeenCalled();
    expect(catalogService.removeProductImage).not.toHaveBeenCalled();
  });
});
