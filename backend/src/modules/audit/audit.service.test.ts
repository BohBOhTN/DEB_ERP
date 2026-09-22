import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { AuditService } from "./audit.service.js";
import { AuthService } from "../auth/auth.service.js";
import type {
  AuthRepository,
  StoredSession,
  StoredUser,
} from "../auth/auth.types.js";
import { hashPassword } from "../auth/password.service.js";

describe("AuditService", () => {
  // NFR-005: a stable sort. Events sharing a timestamp must still page
  // deterministically, so the id breaks the tie.
  it("sorts newest first and breaks ties on id", async () => {
    const prisma = new AuditPrismaDouble();
    const service = new AuditService(prisma as unknown as PrismaClient);
    const sameInstant = new Date("2026-09-22T10:00:00.000Z");
    prisma.store.auditEvents.push(
      {
        id: "a",
        action: "pos_sale.post",
        entity: "sale",
        createdAt: sameInstant,
      },
      {
        id: "c",
        action: "expense.post",
        entity: "expense",
        createdAt: sameInstant,
      },
      { id: "b", action: "auth.login", entity: "user", createdAt: sameInstant },
    );

    const page = await service.listEvents({ page: 1, pageSize: 25 });

    expect(page.items.map((event) => event.id)).toEqual(["c", "b", "a"]);
    expect(page.total).toBe(3);
  });

  it("filters by entity, action prefix, and date range", async () => {
    const prisma = new AuditPrismaDouble();
    const service = new AuditService(prisma as unknown as PrismaClient);
    prisma.store.auditEvents.push(
      {
        id: "1",
        action: "pos_sale.post",
        entity: "sale",
        createdAt: new Date("2026-09-20T10:00:00.000Z"),
      },
      {
        id: "2",
        action: "auth.login",
        entity: "user",
        createdAt: new Date("2026-09-22T10:00:00.000Z"),
      },
      {
        id: "3",
        action: "auth.login_failed",
        entity: "user",
        createdAt: new Date("2026-09-22T11:00:00.000Z"),
      },
    );

    const byEntity = await service.listEvents({
      entity: "user",
      page: 1,
      pageSize: 25,
    });
    const byAction = await service.listEvents({
      action: "auth.",
      page: 1,
      pageSize: 25,
    });
    const byRange = await service.listEvents({
      from: new Date("2026-09-21T00:00:00.000Z"),
      page: 1,
      pageSize: 25,
    });

    expect(byEntity.total).toBe(2);
    expect(byAction.total).toBe(2);
    expect(byRange.total).toBe(2);
  });

  it("paginates server-side", async () => {
    const prisma = new AuditPrismaDouble();
    const service = new AuditService(prisma as unknown as PrismaClient);

    for (let index = 0; index < 30; index += 1) {
      prisma.store.auditEvents.push({
        id: `event-${String(index).padStart(3, "0")}`,
        action: "pos_sale.post",
        entity: "sale",
        createdAt: new Date(2026, 8, 22, 10, index),
      });
    }

    const second = await service.listEvents({ page: 2, pageSize: 25 });

    expect(second.items).toHaveLength(5);
    expect(second.total).toBe(30);
    expect(second.pageCount).toBe(2);
  });
});

describe("authentication security events", () => {
  it("records a successful login and the matching logout", async () => {
    const { authService, recorded } = await makeAuthService();

    const login = await authService.login({
      email: "admin@example.com",
      password: "correct-password",
    });
    await authService.logout(login.sessionToken);

    expect(recorded).toEqual([
      expect.objectContaining({
        action: "auth.login",
        entity: "user",
        actorUserId: "user-1",
      }),
      expect.objectContaining({
        action: "auth.logout",
        entity: "user",
        actorUserId: "user-1",
      }),
    ]);
  });

  it("records a failed login against the targeted account", async () => {
    const { authService, recorded } = await makeAuthService();

    await expect(
      authService.login({
        email: "admin@example.com",
        password: "wrong-password",
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });

    expect(recorded).toEqual([
      expect.objectContaining({
        action: "auth.login_failed",
        actorUserId: "user-1",
        reason: "invalid_password",
      }),
    ]);
  });

  // The submitted address is attacker-controlled, so it is counted but never
  // stored.
  it("records an unknown-email attempt without storing the address", async () => {
    const { authService, recorded } = await makeAuthService();

    await expect(
      authService.login({
        email: "nobody@example.com",
        password: "whatever",
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });

    expect(recorded).toEqual([
      expect.objectContaining({
        action: "auth.login_failed",
        reason: "unknown_email",
      }),
    ]);
    expect(JSON.stringify(recorded)).not.toContain("nobody@example.com");
  });

  it("records a rejected login for a deactivated user", async () => {
    const { authService, repository, recorded } = await makeAuthService();
    const user = repository.users.get("admin@example.com");

    if (user) {
      user.isActive = false;
    }

    await expect(
      authService.login({
        email: "admin@example.com",
        password: "correct-password",
      }),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });

    expect(recorded).toEqual([
      expect.objectContaining({
        action: "auth.login_failed",
        reason: "inactive_user",
      }),
    ]);
  });

  // Auditing must never break the request it describes.
  it("still logs in when the audit recorder fails", async () => {
    const repository = new InMemoryAuthRepository();
    await repository.createUser({
      email: "admin@example.com",
      displayName: "Admin",
      passwordHash: await hashPassword("correct-password"),
    });
    const authService = new AuthService(repository, 30, {
      record: async () => {
        throw new Error("audit sink unavailable");
      },
    });

    const login = await authService.login({
      email: "admin@example.com",
      password: "correct-password",
    });

    expect(login.user.email).toBe("admin@example.com");
  });
});

async function makeAuthService() {
  const repository = new InMemoryAuthRepository();
  const recorded: Array<Record<string, unknown>> = [];
  const authService = new AuthService(repository, 30, {
    record: async (event) => {
      recorded.push(event as Record<string, unknown>);
    },
  });

  await repository.createUser({
    email: "admin@example.com",
    displayName: "Admin",
    passwordHash: await hashPassword("correct-password"),
  });

  return { authService, repository, recorded };
}

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

interface AuditStore {
  auditEvents: Array<Record<string, unknown> & { id: string; createdAt: Date }>;
}

class AuditPrismaDouble {
  public store: AuditStore = { auditEvents: [] };

  public readonly auditEvent = {
    findMany: async (args: {
      where?: Record<string, unknown>;
      skip?: number;
      take?: number;
      distinct?: string[];
    }) => {
      if (args.distinct) {
        return this.store.auditEvents;
      }

      const filtered = filterEvents(this.store.auditEvents, args.where).sort(
        (left, right) => {
          const byTime = right.createdAt.getTime() - left.createdAt.getTime();
          return byTime !== 0 ? byTime : right.id.localeCompare(left.id);
        },
      );

      return filtered.slice(
        args.skip ?? 0,
        (args.skip ?? 0) + (args.take ?? 25),
      );
    },
    count: async (args: { where?: Record<string, unknown> }) =>
      filterEvents(this.store.auditEvents, args.where).length,
  };

  public async $transaction<TResult>(
    actions: Array<Promise<unknown>>,
  ): Promise<TResult> {
    return (await Promise.all(actions)) as TResult;
  }
}

function filterEvents(
  events: AuditStore["auditEvents"],
  where?: Record<string, unknown>,
) {
  if (!where) {
    return [...events];
  }

  return events.filter((event) => {
    if (where.entity && event.entity !== where.entity) {
      return false;
    }

    const action = where.action as { startsWith?: string } | undefined;

    if (
      action?.startsWith &&
      !String(event.action).startsWith(action.startsWith)
    ) {
      return false;
    }

    const range = where.createdAt as { gte?: Date; lte?: Date } | undefined;

    if (range?.gte && event.createdAt < range.gte) {
      return false;
    }

    if (range?.lte && event.createdAt > range.lte) {
      return false;
    }

    return true;
  });
}
