import type {
  AccessUser,
  AuditEventLike,
  Permission,
  Role,
} from "./accessTypes.js";

export type { AuditEventLike };

let sequence = 0;
const next = () => (sequence += 1);

export const permissionCatalogue: Permission[] = [
  {
    key: "products.view",
    module: "Produits",
    labelFr: "Voir",
    descriptionFr: "Voir les produits",
  },
  {
    key: "products.create",
    module: "Produits",
    labelFr: "Créer",
    descriptionFr: "Créer des produits",
  },
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
  {
    key: "users.view",
    module: "Utilisateurs",
    labelFr: "Voir",
    descriptionFr: "Voir les utilisateurs",
  },
  {
    key: "audit.view",
    module: "Administration",
    labelFr: "Voir",
    descriptionFr: "Voir le journal d'audit",
  },
];

export function makeRole(overrides: Partial<Role> = {}): Role {
  const n = next();
  const permissionKeys = overrides.permissionKeys ?? ["products.view"];
  return {
    id: `role-${n}`,
    name: `Rôle ${n}`,
    description: null,
    isActive: true,
    isSystem: false,
    systemKey: null,
    permissionKeys,
    permissionCount: permissionKeys.length,
    userCount: 0,
    ...overrides,
  };
}

export function makeAccessUser(
  overrides: Partial<AccessUser> = {},
): AccessUser {
  const n = next();
  return {
    id: `user-${n}`,
    email: `user${n}@example.com`,
    displayName: `Utilisateur ${n}`,
    isActive: true,
    version: 1,
    createdAt: "2026-09-01T08:00:00.000Z",
    roles: [],
    ...overrides,
  };
}
