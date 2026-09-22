import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { PermissionCache } from "../auth/permissionCache.js";
import { AccessService } from "./access.service.js";

/// AS-V2-05: reading the permission catalogue issues no write, and every
/// access mutation drops the cached effective permissions so the change is
/// visible on the very next request.
const storedUser = {
  id: "user-1",
  email: "cashier@example.com",
  displayName: "Caissier",
  isActive: true,
  version: 2,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  roles: [],
};

function makePrisma() {
  const upsert = vi.fn();
  const role = {
    id: "role-1",
    name: "Caissier",
    isSystem: false,
    isActive: true,
    permissions: [{ permissionKey: "pos.sell" }],
  };
  const prisma = {
    permission: {
      upsert,
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([
        { key: "pos.sell", module: "Caisse", labelFr: "Vendre" },
        { key: "users.view", module: "Utilisateurs", labelFr: "Voir" },
        { key: "pos.access", module: "Caisse", labelFr: "Accéder" },
      ]),
    },
    role: {
      findUnique: vi.fn().mockResolvedValue(role),
      update: vi.fn().mockResolvedValue({ ...role, name: "Caisse" }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(storedUser),
      findMany: vi.fn().mockResolvedValue([storedUser]),
      count: vi.fn().mockResolvedValue(1),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockResolvedValue(storedUser),
    },
    auditEvent: {
      create: vi.fn().mockResolvedValue(undefined),
    },
    $transaction: vi.fn(async (action: (tx: unknown) => Promise<unknown>) =>
      action({
        rolePermission: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
        role: { findUniqueOrThrow: vi.fn().mockResolvedValue(role) },
      }),
    ),
  };

  return { prisma: prisma as unknown as PrismaClient, upsert };
}

describe("AccessService permission cache", () => {
  it("lists permissions without writing to the catalogue", async () => {
    const { prisma, upsert } = makePrisma();
    const service = new AccessService(prisma);

    const permissions = await service.listPermissions();
    const groups = await service.listPermissionGroups();

    expect(permissions).toHaveLength(3);
    expect(groups.map((group) => group.module)).toEqual([
      "Caisse",
      "Utilisateurs",
    ]);
    expect(groups[0]?.permissions.map((item) => item.key)).toEqual([
      "pos.sell",
      "pos.access",
    ]);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("invalidates every cached user when a role changes", async () => {
    const { prisma } = makePrisma();
    const cache = new PermissionCache();
    cache.set("user-1", ["pos.sell"]);
    cache.set("user-2", ["audit.view"]);
    const service = new AccessService(prisma, cache);

    await service.updateRole(
      "role-1",
      { name: "Caisse" },
      { actorUserId: "admin" },
    );

    expect(cache.size).toBe(0);
  });

  it("invalidates every cached user when a role's permissions change", async () => {
    const { prisma } = makePrisma();
    const cache = new PermissionCache();
    cache.set("user-1", ["pos.sell"]);
    const service = new AccessService(prisma, cache);

    await service.replaceRolePermissions("role-1", ["pos.sell"], {
      actorUserId: "admin",
    });

    expect(cache.get("user-1")).toBeUndefined();
  });
});

describe("AccessService users", () => {
  it("filters and pages the user search", async () => {
    const { prisma } = makePrisma();
    const service = new AccessService(prisma);

    const page = await service.searchUsers({
      page: 2,
      pageSize: 10,
      search: "cais",
      isActive: true,
      roleId: "role-1",
      sort: { field: "email", direction: "desc" },
    });

    expect(page).toMatchObject({
      page: 2,
      pageSize: 10,
      total: 1,
      pageCount: 1,
    });
    expect(vi.mocked(prisma.user.findMany).mock.calls[0]?.[0]).toMatchObject({
      where: {
        isActive: true,
        roles: { some: { roleId: "role-1" } },
        OR: [
          { displayName: { contains: "cais", mode: "insensitive" } },
          { email: { contains: "cais", mode: "insensitive" } },
        ],
      },
      orderBy: [{ email: "desc" }, { id: "asc" }],
      skip: 10,
      take: 10,
    });
  });

  it("refuses a user update made from a stale version", async () => {
    const { prisma } = makePrisma();
    const service = new AccessService(prisma);

    await expect(
      service.updateUser(
        "user-1",
        { displayName: "Caisse", version: 1 },
        { actorUserId: "admin" },
      ),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it("updates the user, bumps the version, and audits the change", async () => {
    const { prisma } = makePrisma();
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 });
    const service = new AccessService(prisma);

    await service.updateUser(
      "user-1",
      { displayName: " Caisse ", email: "Caisse@Example.com", version: 2 },
      { actorUserId: "admin" },
    );

    expect(vi.mocked(prisma.user.updateMany).mock.calls[0]?.[0]).toEqual({
      where: { id: "user-1", version: 2 },
      data: {
        version: { increment: 1 },
        displayName: "Caisse",
        email: "caisse@example.com",
      },
    });
    expect(
      vi.mocked(prisma.auditEvent.create).mock.calls[0]?.[0],
    ).toMatchObject({ data: { action: "user.update", targetId: "user-1" } });
  });

  // A reset ends the sessions of the target and never logs the password.
  it("resets the password, revokes sessions, and drops the cached permissions", async () => {
    const { prisma } = makePrisma();
    const cache = new PermissionCache();
    cache.set("user-1", ["pos.sell"]);
    const service = new AccessService(prisma, cache);

    await service.resetPassword(
      "user-1",
      { password: "temporary-1" },
      { actorUserId: "admin" },
    );

    const update = vi.mocked(prisma.user.update).mock.calls[0]?.[0];
    expect(update?.data.passwordHash).toMatch(/^\$2[ab]\$/);
    expect(update?.data.sessions).toMatchObject({
      updateMany: { where: { revokedAt: null } },
    });
    expect(
      JSON.stringify(vi.mocked(prisma.auditEvent.create).mock.calls[0]?.[0]),
    ).not.toContain("temporary-1");
    expect(cache.get("user-1")).toBeUndefined();
  });
});
