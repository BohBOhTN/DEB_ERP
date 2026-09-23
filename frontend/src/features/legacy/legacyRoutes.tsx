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
const orders = lazyScreen(
  () => import("../orders/OrderManagement"),
  "OrderManagement",
);
const customers = lazyScreen(
  () => import("../customers/CustomerManagement"),
  "CustomerManagement",
);
const distribution = lazyScreen(
  () => import("../distribution/DistributionManagement"),
  "DistributionManagement",
);
const procurement = lazyScreen(
  () => import("../procurement/ProcurementManagement"),
  "ProcurementManagement",
);
const catalog = lazyScreen(
  () => import("../catalog/CatalogManagement"),
  "CatalogManagement",
);
const inventory = lazyScreen(
  () => import("../inventory/InventoryManagement"),
  "InventoryManagement",
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

/// Every V1 screen at its new French path (06 section 3.7, 07 section 2).
/// A V1 screen covers a whole module, so several paths share one screen
/// until the module is rebuilt in R8 or R9.
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
    path: "/commandes",
    screen: orders,
    anyOf: ["orders.view"],
    title: "Commandes",
  },
  {
    path: "/clients",
    screen: customers,
    anyOf: ["customers.view"],
    title: "Clients",
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
    path: "/achats",
    screen: procurement,
    anyOf: ["purchases.view"],
    title: "Achats",
  },
  {
    path: "/fournisseurs",
    screen: procurement,
    anyOf: ["suppliers.view"],
    title: "Fournisseurs",
  },
  {
    path: "/paiements-fournisseurs",
    screen: procurement,
    anyOf: ["supplier_payments.view"],
    title: "Paiements fournisseurs",
  },
  {
    path: "/produits",
    screen: catalog,
    anyOf: ["products.view"],
    title: "Produits",
  },
  {
    path: "/matieres-premieres",
    screen: catalog,
    anyOf: ["raw_materials.view"],
    title: "Matières premières",
  },
  {
    path: "/catalogue/parametres",
    screen: catalog,
    anyOf: ["categories.view", "units.view"],
    title: "Catégories et unités",
  },
  {
    path: "/stock",
    screen: inventory,
    anyOf: ["inventory.view"],
    title: "Stock",
  },
  {
    path: "/stock/mouvements",
    screen: inventory,
    anyOf: ["inventory.movements.view"],
    title: "Mouvements",
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
