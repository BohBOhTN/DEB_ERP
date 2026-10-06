import { Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { FilterBar } from "../../../components/patterns/FilterBar/FilterBar.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PermissionGate } from "../../../components/patterns/PermissionGate/PermissionGate.js";
import { Badge } from "../../../components/ui/Badge/Badge.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog/ConfirmDialog.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { formatMoney } from "../../../i18n/format.js";
import { mediaUrl } from "../../../lib/api/media.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type { Product } from "../catalog.api.js";
import {
  useCategories,
  useProducts,
  useSetProductActivation,
} from "../catalog.queries.js";
import { ProductFormDialog } from "../components/ProductFormDialog.js";
import { productMargin } from "../components/productMargin.js";
import {
  RowActions,
  activeFilter,
  listDefaults,
  sortFrom,
} from "../components/catalogTable.js";
import styles from "./CatalogPages.module.css";

const defaults = {
  ...listDefaults,
  categoryId: "",
  stockable: "",
  resale: "",
};

/// `/produits` (UI-10): the product list with search, filters and sort in
/// the URL, creation and edition dialogs, activation with an impact block.
export function ProductsPage() {
  const permissions = useSessionPermissions();
  const navigate = useNavigate();
  const toast = useToast();
  const [state, setState] = useUrlState(defaults);
  const [editing, setEditing] = useState<Product | null | "new">(null);
  const [toggling, setToggling] = useState<Product | null>(null);
  const categories = useCategories();
  const activation = useSetProductActivation();
  const query = useProducts({
    page: state.page,
    pageSize: state.pageSize,
    q: state.q || undefined,
    sort: sortFrom(state.sort),
    isActive: activeFilter(state.isActive),
    ...(state.categoryId ? { categoryId: state.categoryId } : {}),
    ...(state.stockable ? { isStockable: state.stockable === "true" } : {}),
    ...(state.resale ? { isResale: state.resale === "true" } : {}),
  } as Parameters<typeof useProducts>[0]);
  const activeCount =
    (state.isActive !== "true" ? 1 : 0) +
    (state.categoryId ? 1 : 0) +
    (state.stockable ? 1 : 0) +
    (state.resale ? 1 : 0);

  const columns: DataTableColumn<Product>[] = [
    {
      id: "name",
      header: "Nom",
      meta: { sortField: "name" },
      cell: ({ row }) => (
        <span className={styles.nameCell}>
          {row.original.imageUrl ? (
            <img
              src={mediaUrl(row.original.imageUrl) ?? ""}
              alt=""
              width={32}
              height={32}
              loading="lazy"
              className={styles.thumb}
            />
          ) : (
            <span className={styles.thumbEmpty} aria-hidden="true" />
          )}
          <span>{row.original.name}</span>
          <Badge tone="neutral">{row.original.category.name}</Badge>
          {row.original.isResale ? <Badge tone="accent">Revente</Badge> : null}
        </span>
      ),
    },
    { id: "code", header: "Code", accessorFn: (row) => row.code ?? "—" },
    { id: "unit", header: "Unité", accessorFn: (row) => row.baseUnit.symbol },
    {
      id: "price",
      header: "Prix",
      meta: { align: "right", sortField: "salePriceTnd" },
      accessorFn: (row) => formatMoney(row.salePriceTnd),
    },
    ...(permissions.has("margin.view")
      ? ([
          {
            id: "cost",
            header: "Coût",
            meta: { align: "right", sortField: "approximateCostTnd" },
            accessorFn: (row) =>
              row.approximateCostTnd === null ||
              row.approximateCostTnd === undefined
                ? "—"
                : formatMoney(row.approximateCostTnd),
          },
          {
            id: "margin",
            header: "Marge",
            meta: { align: "right" },
            accessorFn: (row) => {
              const margin = productMargin(
                row.salePriceTnd,
                row.approximateCostTnd,
              );
              return margin
                ? `${formatMoney(margin.amountTnd)}${margin.rate ? ` (${margin.rate.replace(".", ",")} %)` : ""}`
                : "—";
            },
          },
        ] satisfies DataTableColumn<Product>[])
      : []),
    {
      id: "stockable",
      header: "Stockable",
      cell: ({ row }) => (
        <Badge tone={row.original.isStockable ? "info" : "neutral"}>
          {row.original.isStockable ? "Suivi" : "Non suivi"}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "Statut",
      meta: { sortField: "isActive" },
      cell: ({ row }) => (
        <StatusPill status={row.original.isActive ? "ACTIVE" : "INACTIVE"} />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title="Produits"
        description="Les produits vendus en caisse et en commande."
        actions={
          <PermissionGate
            permissions={permissions}
            permission="products.create"
          >
            <Button leftIcon={<Plus />} onClick={() => setEditing("new")}>
              Nouveau produit
            </Button>
          </PermissionGate>
        }
      />
      <FilterBar
        search={state.q}
        onSearchChange={(q) => setState({ q, page: 1 })}
        searchPlaceholder="Rechercher un produit"
        activeCount={activeCount}
        onReset={() =>
          setState({
            isActive: "true",
            categoryId: "",
            stockable: "",
            resale: "",
            page: 1,
          })
        }
        filters={
          <>
            <Select
              aria-label="Catégorie"
              placeholder="Toutes les catégories"
              clearable
              value={state.categoryId || null}
              onValueChange={(categoryId) =>
                setState({ categoryId: categoryId ?? "", page: 1 })
              }
              options={(categories.data?.items ?? []).map((category) => ({
                value: category.id,
                label: category.name,
              }))}
            />
            <Select
              aria-label="Statut"
              value={state.isActive || "all"}
              onValueChange={(value) =>
                setState({
                  isActive: value === "all" ? "" : (value ?? "true"),
                  page: 1,
                })
              }
              options={[
                { value: "true", label: "Actifs" },
                { value: "false", label: "Inactifs" },
                { value: "all", label: "Tous" },
              ]}
            />
            <Select
              aria-label="Stockable"
              placeholder="Stockable ou non"
              clearable
              value={state.stockable || null}
              onValueChange={(value) =>
                setState({ stockable: value ?? "", page: 1 })
              }
              options={[
                { value: "true", label: "Stock suivi" },
                { value: "false", label: "Sans stock" },
              ]}
            />
            <Select
              aria-label="Origine"
              placeholder="Fabriqué ou revente"
              clearable
              value={state.resale || null}
              onValueChange={(value) =>
                setState({ resale: value ?? "", page: 1 })
              }
              options={[
                { value: "true", label: "Produits de revente" },
                { value: "false", label: "Fabriqués ici" },
              ]}
            />
          </>
        }
      />
      <DataTable<Product>
        label="Produits"
        columns={columns}
        data={query.data?.items ?? []}
        total={query.data?.total ?? 0}
        page={state.page}
        pageSize={state.pageSize}
        sort={sortFrom(state.sort)}
        onChange={(change) =>
          setState({
            ...(change.page ? { page: change.page } : {}),
            ...(change.pageSize ? { pageSize: change.pageSize } : {}),
            ...(change.sort
              ? { sort: `${change.sort.field}:${change.sort.direction}` }
              : {}),
          })
        }
        loading={query.isPending || query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{
          title: "Aucun produit",
          description:
            activeCount > 0 || state.q
              ? "Modifiez la recherche ou les filtres."
              : "Créez votre premier produit pour commencer à vendre.",
        }}
        getRowId={(row) => row.id}
        onRowClick={(row) => navigate(`/produits/${row.id}`)}
        rowActions={(row) => (
          <RowActions
            permissions={permissions}
            isActive={row.isActive}
            editPermission="products.update"
            activatePermission="products.activate"
            onEdit={() => setEditing(row)}
            onToggleActivation={() => setToggling(row)}
          />
        )}
        mobileCard={(row) => (
          <>
            <span className={styles.nameCell}>
              <strong>{row.name}</strong>
              <Badge tone="neutral">{row.category.name}</Badge>
            </span>
            <span className="tabular-nums">
              {formatMoney(row.salePriceTnd)} · {row.baseUnit.symbol}
            </span>
            <StatusPill status={row.isActive ? "ACTIVE" : "INACTIVE"} />
          </>
        )}
      />
      <ProductFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        product={editing === "new" ? null : editing}
      />
      <ConfirmDialog
        open={toggling !== null}
        title={
          toggling?.isActive
            ? `Désactiver ${toggling.name}`
            : `Réactiver ${toggling?.name ?? ""}`
        }
        tone={toggling?.isActive ? "danger" : "default"}
        confirmLabel={toggling?.isActive ? "Désactiver" : "Réactiver"}
        loading={activation.isPending}
        impact={
          toggling?.isActive ? (
            <p>
              Le produit ne sera plus proposé en caisse. L'historique des ventes
              est conservé.
            </p>
          ) : (
            <p>
              Le produit sera de nouveau proposé en caisse et dans les
              commandes.
            </p>
          )
        }
        onConfirm={() => {
          if (!toggling) return;
          activation.mutate(
            {
              productId: toggling.id,
              version: toggling.version,
              isActive: !toggling.isActive,
            },
            {
              onSuccess: (product) => {
                toast.success(
                  product.isActive ? "Produit réactivé" : "Produit désactivé",
                  product.name,
                );
                setToggling(null);
              },
              onError: (error) => toast.fromError(error),
            },
          );
        }}
        onCancel={() => setToggling(null)}
      />
    </>
  );
}
