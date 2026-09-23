import { http } from "msw";
import type { AccessUser, Role } from "../../../features/access/access.api.js";
import type { AuditEvent } from "../../../features/audit/audit.api.js";
import {
  makeAccessUser,
  makeRole,
  permissionCatalogue,
} from "../../factories/access.js";
import { makePage } from "../../factories/page.js";
import { apiError, apiV1, ok } from "../envelope.js";

/// In-memory access and audit: roles with their permission keys, users
/// with their roles, the last active Super Admin rule, and an audit row
/// appended for every change so the journal reads the story (AS-V2-22).
export interface AccessStore {
  roles: Role[];
  users: AccessUser[];
  audit: AuditEvent[];
  /// Effective permissions the session answers with, updated on save.
  sessionPermissions: string[] | null;
}

export function makeAccessStore(
  overrides: Partial<AccessStore> = {},
): AccessStore {
  const superAdmin = makeRole({
    id: "role-super",
    name: "Super Admin",
    isSystem: true,
    systemKey: "SUPER_ADMIN",
    permissionKeys: permissionCatalogue.map((permission) => permission.key),
    userCount: 1,
  });
  const cashier = makeRole({
    id: "role-cashier",
    name: "Caissier",
    description: "Vend à la caisse",
    permissionKeys: ["pos.access", "pos.sell", "customers.view"],
    userCount: 1,
  });
  const summary = (role: Role) => ({
    id: role.id,
    name: role.name,
    isActive: role.isActive,
    isSystem: role.isSystem,
    systemKey: role.systemKey,
  });
  return {
    roles: [superAdmin, cashier],
    users: [
      makeAccessUser({
        id: "user-1",
        email: "salma@example.com",
        displayName: "Salma Ben Ali",
        roles: [summary(superAdmin)],
      }),
      makeAccessUser({
        id: "user-2",
        email: "amine@example.com",
        displayName: "Amine Trabelsi",
        roles: [summary(cashier)],
      }),
    ],
    audit: [
      {
        id: "audit-1",
        actorUserId: "user-1",
        action: "role.assign_permissions",
        entity: "role",
        targetId: "role-cashier",
        correlationId: "corr-0001",
        reason: null,
        before: { permissionKeys: ["pos.access"] },
        after: { permissionKeys: ["pos.access", "pos.sell"] },
        createdAt: "2026-09-22T09:00:00.000Z",
        actor: {
          id: "user-1",
          displayName: "Salma Ben Ali",
          email: "salma@example.com",
        },
        actionLabelFr: "Modification des autorisations d'un rôle",
        entityLabelFr: "Rôle",
        targetModule: "access",
      },
      {
        id: "audit-2",
        actorUserId: "user-2",
        action: "pos_sale.post",
        entity: "sale",
        targetId: "sale-1",
        correlationId: "corr-0002",
        reason: null,
        before: null,
        after: { reference: "VT-000001", totalTnd: "12.500" },
        createdAt: "2026-09-23T08:30:00.000Z",
        actor: {
          id: "user-2",
          displayName: "Amine Trabelsi",
          email: "amine@example.com",
        },
        actionLabelFr: "Vente en caisse",
        entityLabelFr: "Vente",
        targetModule: "pos",
      },
    ],
    sessionPermissions: null,
    ...overrides,
  };
}

let sequence = 100;
const summaryOf = (role: Role) => ({
  id: role.id,
  name: role.name,
  isActive: role.isActive,
  isSystem: role.isSystem,
  systemKey: role.systemKey,
});

function record(
  store: AccessStore,
  event: Omit<
    AuditEvent,
    "id" | "createdAt" | "actor" | "actorUserId" | "correlationId"
  >,
) {
  sequence += 1;
  store.audit.unshift({
    id: `audit-${sequence}`,
    actorUserId: "user-1",
    correlationId: `corr-${sequence}`,
    createdAt: new Date().toISOString(),
    actor: {
      id: "user-1",
      displayName: "Salma Ben Ali",
      email: "salma@example.com",
    },
    ...event,
  });
}

export function accessHandlers(store: AccessStore = makeAccessStore()) {
  const groups = () => {
    const byModule = new Map<string, typeof permissionCatalogue>();
    for (const permission of permissionCatalogue)
      byModule.set(permission.module, [
        ...(byModule.get(permission.module) ?? []),
        permission,
      ]);
    return [...byModule].map(([module, permissions]) => ({
      module,
      permissions: permissions.map(({ key, labelFr, descriptionFr }) => ({
        key,
        labelFr,
        descriptionFr,
      })),
    }));
  };
  return [
    http.get(`${apiV1}/access/permissions`, () =>
      ok({ permissions: permissionCatalogue, groups: groups() }),
    ),
    http.get(`${apiV1}/access/roles`, () => ok({ roles: store.roles })),
    http.post(`${apiV1}/access/roles`, async ({ request }) => {
      const body = (await request.json()) as {
        name: string;
        description?: string;
        permissionKeys?: string[];
      };
      sequence += 1;
      const role = makeRole({
        id: `role-${sequence}`,
        name: body.name,
        description: body.description ?? null,
        permissionKeys: body.permissionKeys ?? [],
        userCount: 0,
      });
      store.roles.push(role);
      record(store, {
        action: "role.create",
        entity: "role",
        targetId: role.id,
        reason: null,
        before: null,
        after: role,
        actionLabelFr: "Création d'un rôle",
        entityLabelFr: "Rôle",
        targetModule: "access",
      });
      return ok({ role }, 201);
    }),
    http.get(`${apiV1}/access/roles/:id`, ({ params }) => {
      const role = store.roles.find((row) => row.id === params.id);
      return role
        ? ok({ role })
        : apiError(404, "ROLE_NOT_FOUND", "Rôle introuvable.");
    }),
    http.patch(`${apiV1}/access/roles/:id`, async ({ params, request }) => {
      const body = (await request.json()) as Partial<Role>;
      const role = store.roles.find((row) => row.id === params.id);
      if (!role) return apiError(404, "ROLE_NOT_FOUND", "Rôle introuvable.");
      if (role.isSystem)
        return apiError(
          409,
          "PROTECTED_SYSTEM_ROLE",
          "Le rôle Super Admin protégé ne peut pas être modifié ainsi.",
        );
      Object.assign(role, body);
      return ok({ role });
    }),
    http.put(
      `${apiV1}/access/roles/:id/permissions`,
      async ({ params, request }) => {
        const body = (await request.json()) as { permissionKeys: string[] };
        const role = store.roles.find((row) => row.id === params.id);
        if (!role) return apiError(404, "ROLE_NOT_FOUND", "Rôle introuvable.");
        if (role.isSystem)
          return apiError(
            409,
            "PROTECTED_SYSTEM_ROLE",
            "Le rôle Super Admin protégé ne peut pas être modifié ainsi.",
          );
        const before = [...role.permissionKeys];
        role.permissionKeys = [...body.permissionKeys].sort();
        role.permissionCount = role.permissionKeys.length;
        record(store, {
          action: "role.assign_permissions",
          entity: "role",
          targetId: role.id,
          reason: null,
          before: { permissionKeys: before },
          after: { permissionKeys: role.permissionKeys },
          actionLabelFr: "Modification des autorisations d'un rôle",
          entityLabelFr: "Rôle",
          targetModule: "access",
        });
        store.sessionPermissions = [...role.permissionKeys];
        return ok({ role });
      },
    ),
    http.get(`${apiV1}/access/users`, ({ request }) => {
      const url = new URL(request.url);
      const q = url.searchParams.get("q")?.toLowerCase() ?? "";
      const isActive = url.searchParams.get("isActive");
      return ok(
        makePage(
          store.users.filter(
            (user) =>
              (user.displayName.toLowerCase().includes(q) ||
                user.email.toLowerCase().includes(q)) &&
              (isActive === null || String(user.isActive) === isActive),
          ),
        ),
      );
    }),
    http.post(`${apiV1}/access/users`, async ({ request }) => {
      const body = (await request.json()) as {
        email: string;
        displayName: string;
        password: string;
        roleIds: string[];
      };
      if (store.users.some((user) => user.email === body.email))
        return apiError(409, "STATE_CONFLICT", "Cet e-mail est déjà utilisé.");
      sequence += 1;
      const user = makeAccessUser({
        id: `user-${sequence}`,
        email: body.email,
        displayName: body.displayName,
        roles: store.roles
          .filter((role) => body.roleIds.includes(role.id))
          .map(summaryOf),
      });
      store.users.push(user);
      record(store, {
        action: "user.create",
        entity: "user",
        targetId: user.id,
        reason: null,
        before: null,
        after: { email: user.email, displayName: user.displayName },
        actionLabelFr: "Création d'un utilisateur",
        entityLabelFr: "Utilisateur",
        targetModule: "access",
      });
      return ok({ user }, 201);
    }),
    http.get(`${apiV1}/access/users/:id`, ({ params }) => {
      const user = store.users.find((row) => row.id === params.id);
      return user
        ? ok({ user })
        : apiError(404, "USER_NOT_FOUND", "Utilisateur introuvable.");
    }),
    http.patch(`${apiV1}/access/users/:id`, async ({ params, request }) => {
      const body = (await request.json()) as {
        version: number;
        displayName?: string;
        email?: string;
      };
      const user = store.users.find((row) => row.id === params.id);
      if (!user)
        return apiError(404, "USER_NOT_FOUND", "Utilisateur introuvable.");
      if (body.version !== user.version)
        return apiError(
          409,
          "VERSION_CONFLICT",
          "Cette fiche a été modifiée. Rechargez puis réessayez.",
        );
      Object.assign(user, {
        displayName: body.displayName ?? user.displayName,
        email: body.email ?? user.email,
        version: (user.version ?? 1) + 1,
      });
      return ok({ user });
    }),
    http.post(
      `${apiV1}/access/users/:id/password-reset`,
      async ({ params, request }) => {
        const body = (await request.json()) as { password: string };
        const user = store.users.find((row) => row.id === params.id);
        if (!user)
          return apiError(404, "USER_NOT_FOUND", "Utilisateur introuvable.");
        if (body.password.length < 8)
          return apiError(
            400,
            "VALIDATION_ERROR",
            "Les données saisies sont invalides.",
            { password: "Au moins 8 caractères." },
          );
        record(store, {
          action: "user.password_reset",
          entity: "user",
          targetId: user.id,
          reason: null,
          before: null,
          after: null,
          actionLabelFr: "Réinitialisation du mot de passe",
          entityLabelFr: "Utilisateur",
          targetModule: "access",
        });
        return ok({ user });
      },
    ),
    http.put(`${apiV1}/access/users/:id/roles`, async ({ params, request }) => {
      const body = (await request.json()) as { roleIds: string[] };
      const user = store.users.find((row) => row.id === params.id);
      if (!user)
        return apiError(404, "USER_NOT_FOUND", "Utilisateur introuvable.");
      user.roles = store.roles
        .filter((role) => body.roleIds.includes(role.id))
        .map(summaryOf);
      return ok({ user });
    }),
    http.patch(
      `${apiV1}/access/users/:id/activation`,
      async ({ params, request }) => {
        const body = (await request.json()) as { isActive: boolean };
        const user = store.users.find((row) => row.id === params.id);
        if (!user)
          return apiError(404, "USER_NOT_FOUND", "Utilisateur introuvable.");
        const isSuperAdmin = user.roles.some(
          (role) => role.systemKey === "SUPER_ADMIN",
        );
        const otherActiveSuperAdmins = store.users.filter(
          (row) =>
            row.id !== user.id &&
            row.isActive &&
            row.roles.some((role) => role.systemKey === "SUPER_ADMIN"),
        ).length;
        if (!body.isActive && isSuperAdmin && otherActiveSuperAdmins === 0)
          return apiError(
            409,
            "LAST_SUPER_ADMIN_REQUIRED",
            "Le dernier Super Admin actif ne peut pas être désactivé.",
          );
        user.isActive = body.isActive;
        record(store, {
          action: body.isActive ? "user.activate" : "user.deactivate",
          entity: "user",
          targetId: user.id,
          reason: null,
          before: { isActive: !body.isActive },
          after: { isActive: body.isActive },
          actionLabelFr: body.isActive
            ? "Activation d'un utilisateur"
            : "Désactivation d'un utilisateur",
          entityLabelFr: "Utilisateur",
          targetModule: "access",
        });
        return ok({
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            isActive: user.isActive,
            version: user.version,
          },
        });
      },
    ),
    http.get(`${apiV1}/audit-events`, ({ request }) => {
      const url = new URL(request.url);
      const action = url.searchParams.get("action");
      const entity = url.searchParams.get("entity");
      const correlationId = url.searchParams.get("correlationId");
      const actorUserId = url.searchParams.get("actorUserId");
      return ok(
        makePage(
          store.audit.filter(
            (event) =>
              (!action || event.action.startsWith(action)) &&
              (!entity || event.entity === entity) &&
              (!correlationId || event.correlationId === correlationId) &&
              (!actorUserId || event.actorUserId === actorUserId),
          ),
        ),
      );
    }),
    http.get(`${apiV1}/audit-filters`, () => {
      const actions = [
        ...new Set(store.audit.map((event) => event.action)),
      ].sort();
      const entities = [
        ...new Set(store.audit.map((event) => event.entity)),
      ].sort();
      return ok({
        actions,
        entities,
        actionOptions: actions.map((value) => ({
          value,
          labelFr:
            store.audit.find((event) => event.action === value)
              ?.actionLabelFr ?? value,
        })),
        entityOptions: entities.map((value) => ({
          value,
          labelFr:
            store.audit.find((event) => event.entity === value)
              ?.entityLabelFr ?? value,
        })),
      });
    }),
    http.get(`${apiV1}/health/ready`, () =>
      ok({
        status: "ok",
        service: "api",
        environment: "test",
        database: {
          status: "ok",
          migration: "20260921050000_add_procurement_foundation",
        },
        version: "1.4.0",
        gitSha: "abc1234",
      }),
    ),
  ];
}
