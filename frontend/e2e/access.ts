import type { Page, Route } from "@playwright/test";

/// Browser-side access and audit mock for the Sprint 26 flows: roles with
/// their permission keys, users with the last active Super Admin rule, and
/// an audit row appended for every change.
interface Role {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  systemKey: string | null;
  permissionKeys: string[];
  permissionCount: number;
  userCount: number;
}

interface User {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  version: number;
  createdAt: string;
  roles: Array<
    Pick<Role, "id" | "name" | "isActive" | "isSystem" | "systemKey">
  >;
}

interface AuditEvent {
  id: string;
  actorUserId: string;
  action: string;
  entity: string;
  targetId: string;
  correlationId: string;
  reason: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
  actor: { id: string; displayName: string; email: string };
  actionLabelFr: string;
  entityLabelFr: string;
  targetModule: string;
}

export interface AccessState {
  roles: Role[];
  users: User[];
  audit: AuditEvent[];
  /// Permissions the session answers with after a grant (AS-002).
  sessionPermissions: string[] | null;
}

const catalogue = [
  {
    key: "customers.view",
    module: "Clients",
    labelFr: "Voir",
    descriptionFr: "Voir les clients",
  },
  {
    key: "customer_balances.view",
    module: "Clients",
    labelFr: "Voir",
    descriptionFr: "Voir les soldes clients",
  },
  {
    key: "pos.access",
    module: "Caisse",
    labelFr: "Accéder",
    descriptionFr: "Accéder à la caisse",
  },
  {
    key: "pos.sell",
    module: "Caisse",
    labelFr: "Vendre",
    descriptionFr: "Enregistrer une vente",
  },
];

const summary = (role: Role) => ({
  id: role.id,
  name: role.name,
  isActive: role.isActive,
  isSystem: role.isSystem,
  systemKey: role.systemKey,
});

export function makeAccessState(): AccessState {
  const superAdmin: Role = {
    id: "role-super",
    name: "Super Admin",
    description: null,
    isActive: true,
    isSystem: true,
    systemKey: "SUPER_ADMIN",
    permissionKeys: catalogue.map((p) => p.key),
    permissionCount: catalogue.length,
    userCount: 1,
  };
  const cashier: Role = {
    id: "role-cashier",
    name: "Caissier",
    description: "Vend à la caisse",
    isActive: true,
    isSystem: false,
    systemKey: null,
    permissionKeys: ["pos.access", "pos.sell", "customers.view"],
    permissionCount: 3,
    userCount: 1,
  };
  return {
    roles: [superAdmin, cashier],
    users: [
      {
        id: "user-1",
        email: "salma@example.com",
        displayName: "Salma Ben Ali",
        isActive: true,
        version: 1,
        createdAt: "2026-09-01T08:00:00.000Z",
        roles: [summary(superAdmin)],
      },
      {
        id: "user-2",
        email: "amine@example.com",
        displayName: "Amine Trabelsi",
        isActive: true,
        version: 1,
        createdAt: "2026-09-01T08:00:00.000Z",
        roles: [summary(cashier)],
      },
    ],
    audit: [
      {
        id: "audit-1",
        actorUserId: "user-2",
        action: "pos_sale.post",
        entity: "sale",
        targetId: "sale-1",
        correlationId: "corr-0001",
        reason: null,
        before: null,
        after: { reference: "VT-000001" },
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
  };
}

export async function mockAccess(
  page: Page,
  state: AccessState,
): Promise<void> {
  const headers = {
    "Access-Control-Allow-Origin": "http://localhost:5173",
    "Access-Control-Allow-Credentials": "true",
  };
  const envelope = (data: unknown, status = 200) => ({
    status,
    contentType: "application/json",
    headers,
    body: JSON.stringify({ data, meta: { correlationId: "e2e" } }),
  });
  const failure = (status: number, code: string, message: string) => ({
    status,
    contentType: "application/json",
    headers,
    body: JSON.stringify({ error: { code, message, correlationId: "e2e" } }),
  });
  const pageOf = (items: unknown[]) =>
    envelope({
      items,
      page: 1,
      pageSize: 25,
      total: items.length,
      pageCount: 1,
    });
  let sequence = 10;
  const record = (
    event: Omit<
      AuditEvent,
      "id" | "createdAt" | "actor" | "actorUserId" | "correlationId"
    >,
  ) => {
    sequence += 1;
    state.audit.unshift({
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
  };

  await page.route("**/api/v1/access/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/api\/v1/, "");
    const method = route.request().method();
    if (method === "OPTIONS") return route.continue();

    if (path === "/access/permissions") {
      const groups = [...new Set(catalogue.map((p) => p.module))].map(
        (module) => ({
          module,
          permissions: catalogue
            .filter((p) => p.module === module)
            .map(({ key, labelFr, descriptionFr }) => ({
              key,
              labelFr,
              descriptionFr,
            })),
        }),
      );
      return route.fulfill(envelope({ permissions: catalogue, groups }));
    }
    if (path === "/access/roles" && method === "GET")
      return route.fulfill(envelope({ roles: state.roles }));
    const rolePermissions = /^\/access\/roles\/([^/]+)\/permissions$/.exec(
      path,
    );
    if (rolePermissions && method === "PUT") {
      const role = state.roles.find((row) => row.id === rolePermissions[1]);
      if (!role)
        return route.fulfill(
          failure(404, "ROLE_NOT_FOUND", "Rôle introuvable."),
        );
      const body = route.request().postDataJSON() as {
        permissionKeys: string[];
      };
      const before = [...role.permissionKeys];
      role.permissionKeys = [...body.permissionKeys].sort();
      role.permissionCount = role.permissionKeys.length;
      record({
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
      state.sessionPermissions = role.permissionKeys;
      return route.fulfill(envelope({ role }));
    }
    const roleById = /^\/access\/roles\/([^/]+)$/.exec(path);
    if (roleById && method === "GET") {
      const role = state.roles.find((row) => row.id === roleById[1]);
      return route.fulfill(
        role
          ? envelope({ role })
          : failure(404, "ROLE_NOT_FOUND", "Rôle introuvable."),
      );
    }
    if (path === "/access/users" && method === "GET") {
      const q = url.searchParams.get("q")?.toLowerCase() ?? "";
      return route.fulfill(
        pageOf(
          state.users.filter(
            (user) =>
              user.displayName.toLowerCase().includes(q) ||
              user.email.toLowerCase().includes(q),
          ),
        ),
      );
    }
    if (path === "/access/users" && method === "POST") {
      const body = route.request().postDataJSON() as {
        email: string;
        displayName: string;
        password: string;
        roleIds: string[];
      };
      sequence += 1;
      const user: User = {
        id: `user-${sequence}`,
        email: body.email,
        displayName: body.displayName,
        isActive: true,
        version: 1,
        createdAt: new Date().toISOString(),
        roles: state.roles
          .filter((role) => body.roleIds.includes(role.id))
          .map(summary),
      };
      state.users.push(user);
      record({
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
      return route.fulfill(envelope({ user }, 201));
    }
    const activation = /^\/access\/users\/([^/]+)\/activation$/.exec(path);
    if (activation && method === "PATCH") {
      const user = state.users.find((row) => row.id === activation[1]);
      if (!user)
        return route.fulfill(
          failure(404, "USER_NOT_FOUND", "Utilisateur introuvable."),
        );
      const body = route.request().postDataJSON() as { isActive: boolean };
      const isSuperAdmin = user.roles.some(
        (role) => role.systemKey === "SUPER_ADMIN",
      );
      const others = state.users.filter(
        (row) =>
          row.id !== user.id &&
          row.isActive &&
          row.roles.some((role) => role.systemKey === "SUPER_ADMIN"),
      ).length;
      if (!body.isActive && isSuperAdmin && others === 0)
        return route.fulfill(
          failure(
            409,
            "LAST_SUPER_ADMIN_REQUIRED",
            "Le dernier Super Admin actif ne peut pas être désactivé.",
          ),
        );
      user.isActive = body.isActive;
      record({
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
      return route.fulfill(envelope({ user }));
    }
    const userRoles = /^\/access\/users\/([^/]+)\/roles$/.exec(path);
    if (userRoles && method === "PUT") {
      const user = state.users.find((row) => row.id === userRoles[1]);
      if (!user)
        return route.fulfill(
          failure(404, "USER_NOT_FOUND", "Utilisateur introuvable."),
        );
      const body = route.request().postDataJSON() as { roleIds: string[] };
      user.roles = state.roles
        .filter((role) => body.roleIds.includes(role.id))
        .map(summary);
      return route.fulfill(envelope({ user }));
    }
    return route.fulfill(failure(404, "NOT_FOUND", "Ressource introuvable."));
  });

  await page.route("**/api/v1/audit-**", async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/api\/v1/, "");
    if (route.request().method() === "OPTIONS") return route.continue();
    if (path === "/audit-filters") {
      const actions = [
        ...new Set(state.audit.map((event) => event.action)),
      ].sort();
      const entities = [
        ...new Set(state.audit.map((event) => event.entity)),
      ].sort();
      return route.fulfill(
        envelope({
          actions,
          entities,
          actionOptions: actions.map((value) => ({
            value,
            labelFr:
              state.audit.find((event) => event.action === value)
                ?.actionLabelFr ?? value,
          })),
          entityOptions: entities.map((value) => ({
            value,
            labelFr:
              state.audit.find((event) => event.entity === value)
                ?.entityLabelFr ?? value,
          })),
        }),
      );
    }
    const action = url.searchParams.get("action");
    const entity = url.searchParams.get("entity");
    return route.fulfill(
      pageOf(
        state.audit.filter(
          (event) =>
            (!action || event.action.startsWith(action)) &&
            (!entity || event.entity === entity),
        ),
      ),
    );
  });
}
