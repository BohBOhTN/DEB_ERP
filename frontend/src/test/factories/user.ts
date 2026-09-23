export interface SessionUserFixture {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  roles: Array<{ id: string; name: string }>;
  effectivePermissions: string[];
  sessionExpiresAt: string | null;
}

let sequence = 0;

/// A signed-in user as `GET /auth/me` returns it. Permissions default to a
/// cashier; pass `effectivePermissions` for other roles.
export function makeUser(
  overrides: Partial<SessionUserFixture> = {},
): SessionUserFixture {
  sequence += 1;

  return {
    id: `user-${sequence}`,
    email: `utilisateur${sequence}@example.com`,
    displayName: "Amine Trabelsi",
    isActive: true,
    roles: [{ id: "role-cashier", name: "Caissier" }],
    effectivePermissions: [
      "pos.access",
      "pos.sell",
      "customers.view",
      "orders.view",
    ],
    sessionExpiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}
