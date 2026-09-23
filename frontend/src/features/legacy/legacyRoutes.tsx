import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { PermissionKey } from "../../lib/auth/permissions.js";
import type { CurrentUser } from "../auth/authApi";

type Screen = LazyExoticComponent<ComponentType<{ user: CurrentUser }>>;

const lazyScreen = <TModule extends Record<string, unknown>>(
  loader: () => Promise<TModule>,
  name: keyof TModule & string,
): Screen =>
  lazy(async () => {
    const module = await loader();

    return { default: module[name] as ComponentType<{ user: CurrentUser }> };
  });

const pos = lazyScreen(() => import("../pos/PosManagement"), "PosManagement");
const distribution = lazyScreen(
  () => import("../distribution/DistributionManagement"),
  "DistributionManagement",
);
const expenses = lazyScreen(
  () => import("../expenses/ExpenseManagement"),
  "ExpenseManagement",
);
const simulation = lazyScreen(
  () => import("../simulation/SimulationManagement"),
  "SimulationManagement",
);
const access = lazyScreen(
  () => import("../access/AccessManagement"),
  "AccessManagement",
);
const audit = lazyScreen(
  () => import("../audit/AuditManagement"),
  "AuditManagement",
);

export interface LegacyRoute {
  path: string;
  screen: Screen;
  anyOf: readonly PermissionKey[];
  title: string;
}

/// The V1 screens not yet rebuilt, at their new French paths (06 section
/// 3.7, 07 section 2). Catalogue and stock left this table in Sprint 20.
export const legacyRoutes: readonly LegacyRoute[] = [
  { path: "/caisse", screen: pos, anyOf: ["pos.access"], title: "Caisse" },
  {
    path: "/caisse/ventes",
    screen: pos,
    anyOf: ["pos.access"],
    title: "Ventes",
  },
  {
    path: "/caisse/sessions",
    screen: pos,
    anyOf: ["pos.access"],
    title: "Sessions",
  },
  {
    path: "/distributeurs",
    screen: distribution,
    anyOf: ["distributors.view"],
    title: "Distributeurs",
  },
  {
    path: "/distribution/depot-vente",
    screen: distribution,
    anyOf: ["distribution.custody.view"],
    title: "Dépôt-vente",
  },
  {
    path: "/distribution/reglements",
    screen: distribution,
    anyOf: ["distribution.balances.view"],
    title: "Règlements",
  },
  {
    path: "/depenses",
    screen: expenses,
    anyOf: ["expenses.view"],
    title: "Dépenses",
  },
  {
    path: "/simulations",
    screen: simulation,
    anyOf: ["simulations.view"],
    title: "Simulation de coût",
  },
  {
    path: "/utilisateurs",
    screen: access,
    anyOf: ["users.view"],
    title: "Utilisateurs",
  },
  {
    path: "/roles",
    screen: access,
    anyOf: ["roles.view"],
    title: "Rôles et autorisations",
  },
  {
    path: "/audit",
    screen: audit,
    anyOf: ["audit.view"],
    title: "Journal d'audit",
  },
];
