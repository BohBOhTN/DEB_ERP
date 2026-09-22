import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { PermissionCache } from "../auth/permissionCache.js";
import { AccessService } from "./access.service.js";

/// AS-V2-05: reading the permission catalogue issues no write, and every
/// access mutation drops the cached effective permissions so the change is
/// visible on the very next request.
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
      findMany: vi
        .fn()
        .mockResolvedValue([
          { key: "pos.sell", module: "pos", labelFr: "Vendre" },
        ]),
    },
    role: {
      findUnique: vi.fn().mockResolvedValue(role),
      update: vi.fn().mockResolvedValue({ ...role, name: "Caisse" }),
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

    expect(permissions).toHaveLength(1);
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
