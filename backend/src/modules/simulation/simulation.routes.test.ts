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

const simulationBody = {
  name: "Baguette standard",
  outputQuantity: "50",
  outputUnitId: "unit-piece",
  ingredients: [
    {
      ingredientName: "Farine",
      enteredQuantity: "3",
      enteredUnitId: "unit-kg",
      unitPriceTnd: "1.800",
      priceBasisUnitId: "unit-kg",
    },
  ],
};

async function createTestApp(permissionKeys: string[]) {
  const repository = new InMemoryAuthRepository();
  const authService = new AuthService(repository, 30);
  const user = await repository.createUser({
    email: "admin@example.com",
    displayName: "Admin",
    passwordHash: await hashPassword("correct-password"),
  });
  repository.permissions.set(user.id, permissionKeys);

  const simulationService = {
    listSimulations: vi.fn().mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      pageCount: 0,
    }),
    getSimulation: vi.fn().mockResolvedValue({ id: "simulation-1" }),
    createSimulation: vi
      .fn()
      .mockResolvedValue({ simulation: { id: "simulation-1" } }),
    updateSimulation: vi
      .fn()
      .mockResolvedValue({ simulation: { id: "simulation-1" } }),
    duplicateSimulation: vi
      .fn()
      .mockResolvedValue({ simulation: { id: "simulation-2" } }),
    deleteSimulation: vi.fn().mockResolvedValue({ deleted: true }),
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
    simulation: {
      simulationService: simulationService as never,
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
    simulationService,
  };
}

describe("simulation routes", () => {
  it("rejects anonymous simulation access", async () => {
    const { app } = await createTestApp(["simulations.view"]);

    const response = await request(app)
      .get("/api/cost-simulations")
      .expect(401);

    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects listing simulations without simulations.view", async () => {
    const { app, cookie, simulationService } = await createTestApp([
      "simulations.create",
    ]);

    const response = await request(app)
      .get("/api/cost-simulations")
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(simulationService.listSimulations).not.toHaveBeenCalled();
  });

  it("lists and reads simulations with simulations.view", async () => {
    const { app, cookie, simulationService } = await createTestApp([
      "simulations.view",
    ]);

    await request(app)
      .get("/api/cost-simulations")
      .set("Cookie", cookie)
      .expect(200);
    await request(app)
      .get("/api/cost-simulations/simulation-1")
      .set("Cookie", cookie)
      .expect(200);

    expect(simulationService.listSimulations).toHaveBeenCalled();
    expect(simulationService.getSimulation).toHaveBeenCalledWith(
      "simulation-1",
    );
  });

  it("rejects creating a simulation without simulations.create", async () => {
    const { app, cookie, simulationService } = await createTestApp([
      "simulations.view",
    ]);

    const response = await request(app)
      .post("/api/cost-simulations")
      .set("Cookie", cookie)
      .send(simulationBody)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(simulationService.createSimulation).not.toHaveBeenCalled();
  });

  it("requires at least one ingredient", async () => {
    const { app, cookie, simulationService } = await createTestApp([
      "simulations.create",
    ]);

    await request(app)
      .post("/api/cost-simulations")
      .set("Cookie", cookie)
      .send({ ...simulationBody, ingredients: [] })
      .expect(400);

    expect(simulationService.createSimulation).not.toHaveBeenCalled();
  });

  it("creates and duplicates with simulations.create", async () => {
    const { app, cookie, simulationService } = await createTestApp([
      "simulations.create",
    ]);

    await request(app)
      .post("/api/cost-simulations")
      .set("Cookie", cookie)
      .send(simulationBody)
      .expect(201);
    await request(app)
      .post("/api/cost-simulations/simulation-1/duplicate")
      .set("Cookie", cookie)
      .send({})
      .expect(201);

    expect(simulationService.createSimulation).toHaveBeenCalled();
    expect(simulationService.duplicateSimulation).toHaveBeenCalled();
  });

  // The four simulation permissions are deliberately separate authorities.
  it("rejects updating without simulations.update", async () => {
    const { app, cookie, simulationService } = await createTestApp([
      "simulations.create",
      "simulations.view",
    ]);

    const response = await request(app)
      .patch("/api/cost-simulations/simulation-1")
      .set("Cookie", cookie)
      .send({ ...simulationBody, version: 1 })
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(simulationService.updateSimulation).not.toHaveBeenCalled();
  });

  it("updates with simulations.update", async () => {
    const { app, cookie, simulationService } = await createTestApp([
      "simulations.update",
    ]);

    await request(app)
      .patch("/api/cost-simulations/simulation-1")
      .set("Cookie", cookie)
      .send({ ...simulationBody, version: 1 })
      .expect(200);

    expect(simulationService.updateSimulation).toHaveBeenCalledWith(
      "simulation-1",
      expect.objectContaining({ version: 1 }),
      expect.objectContaining({ actorUserId: "user-1" }),
    );
  });

  it("rejects deleting without simulations.delete", async () => {
    const { app, cookie, simulationService } = await createTestApp([
      "simulations.update",
      "simulations.create",
    ]);

    const response = await request(app)
      .delete("/api/cost-simulations/simulation-1")
      .set("Cookie", cookie)
      .expect(403);

    expect(response.body.error.code).toBe("PERMISSION_DENIED");
    expect(simulationService.deleteSimulation).not.toHaveBeenCalled();
  });

  it("deletes with simulations.delete", async () => {
    const { app, cookie, simulationService } = await createTestApp([
      "simulations.delete",
    ]);

    await request(app)
      .delete("/api/cost-simulations/simulation-1")
      .set("Cookie", cookie)
      .expect(200);

    expect(simulationService.deleteSimulation).toHaveBeenCalledWith(
      "simulation-1",
      expect.objectContaining({ actorUserId: "user-1" }),
    );
  });
});
