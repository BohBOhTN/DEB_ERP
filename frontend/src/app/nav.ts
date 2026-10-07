import {
  ArrowLeftRight,
  Banknote,
  Boxes,
  Calculator,
  ChartColumn,
  ClipboardList,
  Croissant,
  Factory,
  HandCoins,
  History,
  Home,
  PackageOpen,
  Receipt,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tag,
  Tags,
  Truck,
  UserCog,
  Users,
  Wallet,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import type { PermissionKey, PermissionSet } from "../lib/auth/permissions.js";
import { hasAny } from "../lib/auth/permissions.js";
import { fr } from "../i18n/fr.js";

/// The navigation manifest (07 section 2.1, 06 section 3.6): one source for
/// the sidebar, the bottom bar, the breadcrumbs and the route guards. Items
/// are filtered by permission before they reach the shell.
export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
  /// Any one of these keys shows the item; empty means "authenticated".
  permissions: readonly PermissionKey[];
  group?: string;
  /// One of the four phone bottom-bar destinations (OD-V2-009).
  mobilePrimary?: boolean;
  /// Other paths that belong to this item for the active state.
  matches?: readonly string[];
}

export const navGroups = {
  sales: "Ventes",
  distribution: "Distribution",
  purchases: "Achats",
  catalogue: "Catalogue",
  stock: "Stock",
  finance: "Finances",
  admin: "Administration",
} as const;

export const navItems: readonly NavItem[] = [
  {
    id: "home",
    label: fr.home,
    icon: Home,
    path: "/",
    permissions: [],
    mobilePrimary: true,
  },
  // The owner's reading of the history (issue 014): ungrouped, right under
  // `Accueil`.
  {
    id: "analytics",
    label: fr.analytics,
    icon: ChartColumn,
    path: "/analyses",
    permissions: ["analytics.view"],
  },
  {
    id: "pos",
    label: fr.pos,
    icon: Store,
    path: "/caisse",
    permissions: ["pos.access"],
    group: navGroups.sales,
    mobilePrimary: true,
  },
  {
    id: "sales",
    label: fr.sales,
    icon: Receipt,
    path: "/caisse/ventes",
    permissions: ["pos.access"],
    group: navGroups.sales,
  },
  {
    id: "sessions",
    label: fr.posSessionHistory,
    icon: History,
    path: "/caisse/sessions",
    permissions: ["pos.access"],
    group: navGroups.sales,
  },
  {
    id: "orders",
    label: fr.orders,
    icon: ClipboardList,
    path: "/commandes",
    permissions: ["orders.view"],
    group: navGroups.sales,
    mobilePrimary: true,
  },
  {
    id: "customers",
    label: fr.customers,
    icon: Users,
    path: "/clients",
    permissions: ["customers.view"],
    group: navGroups.sales,
    mobilePrimary: true,
  },
  {
    id: "distributors",
    label: fr.distributors,
    icon: Truck,
    path: "/distributeurs",
    permissions: ["distributors.view"],
    group: navGroups.distribution,
  },
  {
    id: "consignment",
    label: fr.consignment,
    icon: PackageOpen,
    path: "/distribution/depot-vente",
    permissions: ["distribution.custody.view"],
    group: navGroups.distribution,
  },
  {
    id: "settlements",
    label: fr.distributorSettlements,
    icon: HandCoins,
    path: "/distribution/reglements",
    permissions: ["distribution.balances.view"],
    group: navGroups.distribution,
  },
  {
    id: "purchases",
    label: fr.purchases,
    icon: ShoppingCart,
    path: "/achats",
    permissions: ["purchases.view"],
    group: navGroups.purchases,
  },
  {
    id: "suppliers",
    label: fr.suppliers,
    icon: Factory,
    path: "/fournisseurs",
    permissions: ["suppliers.view"],
    group: navGroups.purchases,
  },
  {
    id: "supplierPayments",
    label: "Paiements",
    icon: Banknote,
    path: "/paiements-fournisseurs",
    permissions: ["supplier_payments.view"],
    group: navGroups.purchases,
  },
  {
    id: "products",
    label: fr.products,
    icon: Croissant,
    path: "/produits",
    permissions: ["products.view"],
    group: navGroups.catalogue,
  },
  {
    id: "rawMaterials",
    label: fr.rawMaterials,
    icon: Wheat,
    path: "/matieres-premieres",
    permissions: ["raw_materials.view"],
    group: navGroups.catalogue,
  },
  {
    id: "priceTags",
    label: fr.priceTags,
    icon: Tag,
    path: "/produits/etiquettes",
    permissions: ["products.view"],
    group: navGroups.catalogue,
  },
  {
    id: "catalogueSettings",
    label: fr.categoriesAndUnits,
    icon: Tags,
    path: "/catalogue/parametres",
    permissions: ["categories.view", "units.view"],
    group: navGroups.catalogue,
  },
  {
    id: "stock",
    label: fr.stock,
    icon: Boxes,
    path: "/stock",
    permissions: ["inventory.view"],
    group: navGroups.stock,
  },
  {
    id: "movements",
    label: fr.stockMovements,
    icon: ArrowLeftRight,
    path: "/stock/mouvements",
    permissions: ["inventory.movements.view"],
    group: navGroups.stock,
  },
  {
    id: "expenses",
    label: fr.expenses,
    icon: Wallet,
    path: "/depenses",
    permissions: ["expenses.view"],
    group: navGroups.finance,
  },
  {
    id: "simulations",
    label: fr.costSimulation,
    icon: Calculator,
    path: "/simulations",
    permissions: ["simulations.view"],
    group: navGroups.finance,
  },
  {
    id: "users",
    label: fr.users,
    icon: UserCog,
    path: "/utilisateurs",
    permissions: ["users.view"],
    group: navGroups.admin,
  },
  {
    id: "roles",
    label: fr.rolesAndPermissions,
    icon: ShieldCheck,
    path: "/roles",
    permissions: ["roles.view"],
    group: navGroups.admin,
  },
  {
    id: "audit",
    label: fr.auditLog,
    icon: ScrollText,
    path: "/audit",
    permissions: ["audit.view"],
    group: navGroups.admin,
  },
];

export function canSee(item: NavItem, permissions: PermissionSet): boolean {
  return item.permissions.length === 0 || hasAny(permissions, item.permissions);
}

export function visibleNavItems(permissions: PermissionSet): NavItem[] {
  return navItems.filter((item) => canSee(item, permissions));
}

/// The item whose path (or one of its aliases) best matches the location,
/// longest prefix first so `/caisse/ventes` beats `/caisse`.
export function activeNavItem(pathname: string): NavItem | undefined {
  return [...navItems]
    .sort((a, b) => b.path.length - a.path.length)
    .find((item) =>
      [item.path, ...(item.matches ?? [])].some(
        (path) =>
          pathname === path ||
          (path !== "/" && pathname.startsWith(`${path}/`)),
      ),
    );
}
