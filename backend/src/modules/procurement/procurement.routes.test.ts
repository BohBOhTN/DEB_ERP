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
    listPurchases: vi.fn().mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      pageCount: 0,
    }),
    createPurchase: vi.fn().mockResolvedValue({
      id: "purchase-1",
      supplierId: "supplier-1",
      status: "DRAFT",
      totalTnd: "250.000",
      paidAmountTnd: "100.000",
    }),
    updateDraftPurchase: vi.fn().mockResolvedValue({
      id: "purchase-1",
      supplierId: "supplier-1",
      status: "DRAFT",
      totalTnd: "300.000",
      paidAmountTnd: "0.000",
    }),
    postPurchase: vi.fn().mockResolvedValue({
      purchase: {
        id: "purchase-1",
        status: "POSTED",
      },
      payment: {
        id: "payment-1",
        amountTnd: "100.000",
      },
    }),
    cancelPurchase: vi.fn().mockResolvedValue({
      purchase: {
        id: "purchase-1",
        status: "CANCELLED",
      },
    }),
    reverseSupplierPayment: vi.fn().mockResolvedValue({
      payment: { id: "payment-2", reversedAt: "2026-09-24T10:00:00.000Z" },
    }),
    listSupplierBalances: vi.fn().mockResolvedValue({
      items: [
        {
          supplier: {
            id: "supplier-1",
            name: "Minoterie Centrale",
          },
          balanceTnd: "150.000",
          openPurchaseCount: 1,
          overduePurchaseCount: 0,
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
      pageCount: 1,
    }),
    getSupplierStatement: vi.fn().mockResolvedValue({
      supplier: {
        id: "supplier-1",
        name: "Minoterie Centrale",
      },
      balanceTnd: "150.000",
      ledgerEntries: [],
      payments: [],
      purchases: [],
    }),
    listSupplierPayments: vi.fn().mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      pageCount: 0,
    }),
    createSupplierPayment: vi.fn().mockResolvedValue({
      payment: {
        id: "payment-2",
        amountTnd: "50.000",
      },
      allocations: [
        {
          purchaseId: "purchase-1",
          amountTnd: "50.000",
        },
      ],
    }),
  };

  const shoppingTripService = {
    post: vi.fn().mockResolvedValue({
      purchase: { id: "purchase-9", status: "POSTED" },
      expenses: [{ id: "expense-9", status: "POSTED" }],
      totals: {
        purchaseTnd: "250.000",
        expensesTnd: "12.500",
        totalTnd: "262.500",
        paidTodayTnd: "112.500",
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
    procurement: {
      procurementService: procurementService as never,
      shoppingTripService: shoppingTripService as never,
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
    shoppingTripService,
  };
}

const tripPermissions = [
  "purchases.create",
  "purchases.post",
  "expenses.create",
];
const tripBody = {
  supplierId: "supplier-1",
  tripDate: "2026-10-05T08:00:00.000Z",
  supplierReference: "T-1234",
  purchase: {
    paymentTerms: "PARTIAL",
    paidAmountTnd: "100.000",
    dueDate: "2026-10-20T08:00:00.000Z",
    lines: [
      {
        rawMaterialId: "raw-material-1",
        enteredUnitId: "unit-kg",
        enteredQuantity: "10",
        unitPriceTnd: "25.000",
      },
    ],
  },
  expenses: [
    {
      categoryId: "category-1",
      description: "Sachets plastiques",
      amountTnd: "12.500",
    },
  ],
};

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

  it("creates purchase drafts when the user has purchases.create", async () => {
    const { app, cookie, procurementService } = await createTestApp([
      "purchases.create",
    ]);

    const response = await request(app)
      .post("/api/procurement/purchases")
      .set("Cookie", cookie)
      .send({
        supplierId: "supplier-1",
        purchaseDate: "2026-09-21T08:00:00.000Z",
        paymentTerms: "PARTIAL",
        paidAmountTnd: "100.000",
        dueDate: "2026-09-30T08:00:00.000Z",
        lines: [
          {
            rawMaterialId: "raw-material-1",
            enteredUnitId: "unit-bag",
            enteredQuantity: "4",
            unitPriceTnd: "2.500",
          },
        ],
      })
      .expect(201);

    expect(response.body.data.purchase).toMatchObject({
      id: "purchase-1",
      status: "DRAFT",
    });
    expect(procurementService.createPurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: "supplier-1",
        paymentTerms: "PARTIAL",
        paidAmountTnd: "100.000",
        lines: [
          {
            rawMaterialId: "raw-material-1",
            enteredUnitId: "unit-bag",
            enteredQuantity: "4",
            unitPriceTnd: "2.500",
          },
        ],
      }),
      expect.objectContaining({
        actorUserId: "user-1",
      }),
    );
  });

  // Issue 019: a line buys a raw material or a resold product; which, and
  // that it is one, is the service's to say.
  it("passes a resold product line to the service and filters purchases by product", async () => {
    const { app, cookie, procurementService } = await createTestApp([
      "purchases.create",
      "purchases.view",
    ]);

    await request(app)
      .post("/api/procurement/purchases")
      .set("Cookie", cookie)
      .send({
        supplierId: "supplier-1",
        purchaseDate: "2026-10-05T08:00:00.000Z",
        paymentTerms: "PAID",
        paidAmountTnd: "20.400",
        lines: [
          {
            productId: "product-1",
            enteredUnitId: "unit-piece",
            enteredQuantity: "24",
            unitPriceTnd: "0.850",
          },
        ],
      })
      .expect(201);
    expect(procurementService.createPurchase).toHaveBeenLastCalledWith(
      expect.objectContaining({
        lines: [
          {
            productId: "product-1",
            enteredUnitId: "unit-piece",
            enteredQuantity: "24",
            unitPriceTnd: "0.850",
          },
        ],
      }),
      expect.anything(),
    );

    await request(app)
      .get("/api/procurement/purchases?productId=product-1")
      .set("Cookie", cookie)
      .expect(200);
    expect(procurementService.listPurchases).toHaveBeenLastCalledWith(
      expect.objectContaining({ productId: "product-1" }),
    );
  });

  it("replaces a draft purchase when the user has purchases.create", async () => {
    const { app, cookie, procurementService } = await createTestApp([
      "purchases.create",
    ]);

    const response = await request(app)
      .patch("/api/procurement/purchases/purchase-1")
      .set("Cookie", cookie)
      .send({
        supplierId: "supplier-1",
        purchaseDate: "2026-09-21T08:00:00.000Z",
        paymentTerms: "UNPAID",
        dueDate: "2026-09-30T08:00:00.000Z",
        lines: [
          {
            rawMaterialId: "raw-material-1",
            enteredUnitId: "unit-bag",
            enteredQuantity: "6",
            unitPriceTnd: "50.000",
          },
        ],
      })
      .expect(200);

    expect(response.body.data.purchase).toMatchObject({
      id: "purchase-1",
      status: "DRAFT",
      totalTnd: "300.000",
    });
    expect(procurementService.updateDraftPurchase).toHaveBeenCalledWith(
      "purchase-1",
      expect.objectContaining({
        supplierId: "supplier-1",
        paymentTerms: "UNPAID",
        paidAmountTnd: "0",
      }),
      expect.objectContaining({
        actorUserId: "user-1",
      }),
    );
  });

  it("refuses to replace a draft purchase without purchases.create", async () => {
    const { app, cookie, procurementService } = await createTestApp([
      "purchases.view",
    ]);

    await request(app)
      .patch("/api/procurement/purchases/purchase-1")
      .set("Cookie", cookie)
      .send({})
      .expect(403);

    expect(procurementService.updateDraftPurchase).not.toHaveBeenCalled();
  });

  it("requires an idempotency key to post purchases", async () => {
    const { app, cookie, procurementService } = await createTestApp([
      "purchases.post",
    ]);

    const response = await request(app)
      .post("/api/procurement/purchases/purchase-1/post")
      .set("Cookie", cookie)
      .expect(400);

    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(procurementService.postPurchase).not.toHaveBeenCalled();
  });

  it("posts purchases when the user has purchases.post", async () => {
    const { app, cookie, procurementService } = await createTestApp([
      "purchases.post",
    ]);

    const response = await request(app)
      .post("/api/procurement/purchases/purchase-1/post")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "post-purchase-1")
      .expect(201);

    expect(response.body.data.purchase).toMatchObject({
      id: "purchase-1",
      status: "POSTED",
    });
    expect(procurementService.postPurchase).toHaveBeenCalledWith(
      "purchase-1",
      {
        idempotencyKey: "post-purchase-1",
      },
      expect.objectContaining({
        actorUserId: "user-1",
      }),
    );
  });

  // Issue 018: the trip posts a purchase and creates expenses, so it needs
  // what each of those needs; one permission short is a refusal.
  it.each(tripPermissions)(
    "refuses a shopping trip without %s",
    async (missing) => {
      const { app, cookie, shoppingTripService } = await createTestApp(
        tripPermissions.filter((key) => key !== missing),
      );

      const response = await request(app)
        .post("/api/procurement/shopping-trips")
        .set("Cookie", cookie)
        .set("Idempotency-Key", "trip-1")
        .send(tripBody)
        .expect(403);

      expect(response.body.error.code).toBe("PERMISSION_DENIED");
      expect(shoppingTripService.post).not.toHaveBeenCalled();
    },
  );

  it("requires an idempotency key to post a shopping trip", async () => {
    const { app, cookie, shoppingTripService } =
      await createTestApp(tripPermissions);

    const response = await request(app)
      .post("/api/procurement/shopping-trips")
      .set("Cookie", cookie)
      .send(tripBody)
      .expect(400);

    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(shoppingTripService.post).not.toHaveBeenCalled();
  });

  it("posts a shopping trip with the three permissions", async () => {
    const { app, cookie, shoppingTripService } =
      await createTestApp(tripPermissions);

    const response = await request(app)
      .post("/api/procurement/shopping-trips")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "trip-1")
      .send(tripBody)
      .expect(201);

    expect(response.body.data).toMatchObject({
      purchase: { id: "purchase-9" },
      expenses: [{ id: "expense-9" }],
      totals: { totalTnd: "262.500" },
    });
    expect(shoppingTripService.post).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "trip-1",
        supplierId: "supplier-1",
        tripDate: new Date("2026-10-05T08:00:00.000Z"),
        purchase: expect.objectContaining({
          paymentTerms: "PARTIAL",
          paidAmountTnd: "100.000",
          lines: tripBody.purchase.lines,
        }),
        expenses: tripBody.expenses,
      }),
      expect.objectContaining({ actorUserId: "user-1" }),
    );
  });

  // Issue 020: a trip's purchase lines take a resold product too.
  it("passes a resold product line of a shopping trip to the service", async () => {
    const { app, cookie, shoppingTripService } =
      await createTestApp(tripPermissions);
    const water = {
      productId: "product-1",
      enteredUnitId: "unit-piece",
      enteredQuantity: "24",
      unitPriceTnd: "0.850",
    };

    await request(app)
      .post("/api/procurement/shopping-trips")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "trip-3")
      .send({
        ...tripBody,
        purchase: {
          ...tripBody.purchase,
          lines: [...tripBody.purchase.lines, water],
        },
      })
      .expect(201);

    expect(shoppingTripService.post).toHaveBeenLastCalledWith(
      expect.objectContaining({
        purchase: expect.objectContaining({
          lines: [...tripBody.purchase.lines, water],
        }),
      }),
      expect.anything(),
    );
  });

  it("defaults a shopping trip to no expense lines", async () => {
    const { app, cookie, shoppingTripService } =
      await createTestApp(tripPermissions);

    await request(app)
      .post("/api/procurement/shopping-trips")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "trip-2")
      .send({ ...tripBody, expenses: undefined })
      .expect(201);

    expect(shoppingTripService.post).toHaveBeenCalledWith(
      expect.objectContaining({ expenses: [] }),
      expect.anything(),
    );
  });

  it("lists supplier balances when the user has supplier_balances.view", async () => {
    const { app, cookie, procurementService } = await createTestApp([
      "supplier_balances.view",
    ]);

    const response = await request(app)
      .get("/api/procurement/supplier-balances")
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data.supplierBalances.items).toEqual([
      expect.objectContaining({
        balanceTnd: "150.000",
      }),
    ]);
    expect(procurementService.listSupplierBalances).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
    });
  });

  it("rejects supplier balances without the exact permission", async () => {
    const { app, cookie, procurementService } = await createTestApp([]);

    const response = await request(app)
      .get("/api/procurement/supplier-balances")
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(procurementService.listSupplierBalances).not.toHaveBeenCalled();
  });

  it("returns supplier statements when the user has supplier_balances.view", async () => {
    const { app, cookie, procurementService } = await createTestApp([
      "supplier_balances.view",
    ]);

    const response = await request(app)
      .get("/api/procurement/suppliers/supplier-1/statement")
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data.statement).toMatchObject({
      balanceTnd: "150.000",
    });
    expect(procurementService.getSupplierStatement).toHaveBeenCalledWith(
      "supplier-1",
      expect.any(Object),
    );
  });

  it("lists supplier payments when the user has supplier_payments.view", async () => {
    const { app, cookie, procurementService } = await createTestApp([
      "supplier_payments.view",
    ]);

    await request(app)
      .get("/api/procurement/supplier-payments?supplierId=supplier-1")
      .set("Cookie", cookie)
      .expect(200);

    expect(procurementService.listSupplierPayments).toHaveBeenCalledWith({
      supplierId: "supplier-1",
      page: 1,
      pageSize: 25,
    });
  });

  it("requires an idempotency key to create supplier payments", async () => {
    const { app, cookie, procurementService } = await createTestApp([
      "supplier_payments.create",
    ]);

    const response = await request(app)
      .post("/api/procurement/supplier-payments")
      .set("Cookie", cookie)
      .send({
        supplierId: "supplier-1",
        paidAt: "2026-09-21T08:00:00.000Z",
        amountTnd: "50.000",
      })
      .expect(400);

    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(procurementService.createSupplierPayment).not.toHaveBeenCalled();
  });

  it("creates supplier payments when the user has supplier_payments.create", async () => {
    const { app, cookie, procurementService } = await createTestApp([
      "supplier_payments.create",
    ]);

    const response = await request(app)
      .post("/api/procurement/supplier-payments")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "supplier-payment-1")
      .send({
        supplierId: "supplier-1",
        paidAt: "2026-09-21T08:00:00.000Z",
        amountTnd: "50.000",
        reference: "PAY-1",
        allocations: [
          {
            purchaseId: "purchase-1",
            amountTnd: "50.000",
          },
        ],
      })
      .expect(201);

    expect(response.body.data.payment).toMatchObject({
      id: "payment-2",
      amountTnd: "50.000",
    });
    expect(procurementService.createSupplierPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "supplier-payment-1",
        supplierId: "supplier-1",
        amountTnd: "50.000",
        reference: "PAY-1",
        allocations: [
          {
            purchaseId: "purchase-1",
            amountTnd: "50.000",
          },
        ],
      }),
      expect.objectContaining({
        actorUserId: "user-1",
      }),
    );
  });

  it("reverses a supplier payment with supplier_payments.create and a reason", async () => {
    const { app, cookie, procurementService } = await createTestApp([
      "supplier_payments.create",
    ]);

    await request(app)
      .post("/api/v1/procurement/supplier-payments/payment-2/reverse")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "reverse-1")
      .send({ reason: "Double saisie" })
      .expect(201);

    expect(procurementService.reverseSupplierPayment).toHaveBeenCalledWith(
      "payment-2",
      { idempotencyKey: "reverse-1", reason: "Double saisie" },
      expect.objectContaining({ actorUserId: expect.any(String) }),
    );
  });

  it("refuses a supplier payment reversal without supplier_payments.create", async () => {
    const { app, cookie, procurementService } = await createTestApp([
      "supplier_payments.view",
    ]);

    await request(app)
      .post("/api/v1/procurement/supplier-payments/payment-2/reverse")
      .set("Cookie", cookie)
      .set("Idempotency-Key", "reverse-1")
      .send({ reason: "Double saisie" })
      .expect(403);

    expect(procurementService.reverseSupplierPayment).not.toHaveBeenCalled();
  });
});
