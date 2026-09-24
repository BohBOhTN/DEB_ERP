import { Plus, Truck, Users, Wheat } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useSessionPermissions } from "./sessionContext.js";
import { CommandPalette } from "../components/patterns/CommandPalette/CommandPalette.js";
import { useNavigate } from "react-router-dom";
import type { PaletteItem } from "../components/patterns/CommandPalette/CommandPalette.js";
import { formatMoney } from "../i18n/format.js";
import type { PermissionKey, PermissionSet } from "../lib/auth/permissions.js";
import { hasPermission } from "../lib/auth/permissions.js";
import { listProducts } from "../features/catalog/catalog.api.js";
import { listCustomerBalances } from "../features/customers/customers.api.js";
import { listSupplierBalances } from "../features/procurement/procurement.api.js";
import { visibleNavItems } from "./nav.js";

interface Action {
  id: string;
  label: string;
  path: string;
  permission: PermissionKey;
  keywords: string[];
}

const actions: Action[] = [
  {
    id: "new-sale",
    label: "Nouvelle vente",
    path: "/caisse",
    permission: "pos.sell",
    keywords: ["caisse", "encaisser"],
  },
  {
    id: "new-order",
    label: "Nouvelle commande",
    path: "/commandes/nouvelle",
    permission: "orders.create",
    keywords: ["client", "acompte"],
  },
  {
    id: "new-purchase",
    label: "Nouvel achat",
    path: "/achats/nouveau",
    permission: "purchases.create",
    keywords: ["fournisseur"],
  },
  {
    id: "new-dispatch",
    label: "Nouvelle sortie en dépôt-vente",
    path: "/distribution/sorties/nouvelle",
    permission: "distribution.dispatch",
    keywords: ["distributeur"],
  },
  {
    id: "new-simulation",
    label: "Nouvelle simulation de coût",
    path: "/simulations/nouvelle",
    permission: "simulations.create",
    keywords: ["recette", "coût"],
  },
];

/// The palette's sources (UI-22): the navigation manifest, the actions the
/// user may start, and a server search over customers, products and
/// suppliers through their `q` endpoints, each behind its permission.
export function usePaletteSources(permissions: PermissionSet): {
  items: PaletteItem[];
  search: (query: string) => Promise<PaletteItem[]>;
} {
  const navigate = useNavigate();
  const items = useMemo<PaletteItem[]>(
    () => [
      ...visibleNavItems(permissions).map((item) => ({
        id: `nav-${item.id}`,
        label: item.label,
        group: "Aller à",
        description: item.group,
        icon: <item.icon />,
        onSelect: () => navigate(item.path),
      })),
      ...actions
        .filter((action) => hasPermission(permissions, action.permission))
        .map((action) => ({
          id: action.id,
          label: action.label,
          group: "Actions",
          icon: <Plus />,
          keywords: action.keywords,
          onSelect: () => navigate(action.path),
        })),
    ],
    [permissions, navigate],
  );

  const search = useCallback(
    async (query: string): Promise<PaletteItem[]> => {
      const page = { page: 1, pageSize: 5, q: query };
      const [customers, products, suppliers] = await Promise.all([
        hasPermission(permissions, "customers.view")
          ? listCustomerBalances(page)
          : null,
        hasPermission(permissions, "products.view") ? listProducts(page) : null,
        hasPermission(permissions, "suppliers.view")
          ? listSupplierBalances(page)
          : null,
      ]);
      return [
        ...(customers?.items ?? []).map((row) => ({
          id: `customer-${row.customer.id}`,
          label: row.customer.name,
          group: "Clients",
          description: `Solde ${formatMoney(row.balanceTnd)}`,
          icon: <Users />,
          onSelect: () => navigate(`/clients/${row.customer.id}`),
        })),
        ...(products?.items ?? []).map((product) => ({
          id: `product-${product.id}`,
          label: product.name,
          group: "Produits",
          description: `${product.category.name} · ${formatMoney(product.salePriceTnd)}`,
          icon: <Wheat />,
          onSelect: () => navigate(`/produits/${product.id}`),
        })),
        ...(suppliers?.items ?? []).map((row) => ({
          id: `supplier-${row.supplier.id}`,
          label: row.supplier.name,
          group: "Fournisseurs",
          description: `Dû ${formatMoney(row.balanceTnd)}`,
          icon: <Truck />,
          onSelect: () => navigate(`/fournisseurs/${row.supplier.id}`),
        })),
      ];
    },
    [permissions, navigate],
  );

  return { items, search };
}

export function PaletteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const permissions = useSessionPermissions();
  const { items, search } = usePaletteSources(permissions);
  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      items={items}
      search={search}
    />
  );
}
