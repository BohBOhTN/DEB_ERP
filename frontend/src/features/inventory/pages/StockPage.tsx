import { AlertTriangle, Plus, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { FilterBar } from "../../../components/patterns/FilterBar/FilterBar.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PermissionGate } from "../../../components/patterns/PermissionGate/PermissionGate.js";
import { StockBadge } from "../../../components/patterns/StockBadge/StockBadge.js";
import { Badge } from "../../../components/ui/Badge/Badge.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { SegmentedControl } from "../../../components/ui/SegmentedControl/SegmentedControl.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { formatDateTime } from "../../../i18n/format.js";
import { plural } from "../../../i18n/fr.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type { InventoryBalance } from "../inventory.api.js";
import { useBalances } from "../inventory.queries.js";
import { StockMovementDialog } from "../components/StockMovementDialog.js";
import styles from "./StockPage.module.css";

const defaults = {
  q: "",
  type: "",
  negatifs: "0",
  sort: "name:asc",
  page: 1,
  pageSize: 25,
};

const typeLabel: Record<InventoryBalance["itemType"], string> = {
  PRODUCT: "Produit",
  RAW_MATERIAL: "Matière",
};

/// `/stock` (UI-11): balances of the main location. The balances endpoint
/// returns every item of the single location in one response (tens of
/// rows), so search, filter, sort and paging are applied here.
export function StockPage() {
  const permissions = useSessionPermissions();
  const navigate = useNavigate();
  const balances = useBalances();
  const [state, setState] = useUrlState(defaults);
  const [dialog, setDialog] = useState<"opening" | "adjustment" | null>(null);

  const rows = useMemo(() => {
    const all = balances.data ?? [];
    const q = state.q.trim().toLowerCase();
    const [sortField, sortDirection] = state.sort.split(":");
    const filtered = all.filter(
      (row) =>
        (!q || row.itemName.toLowerCase().includes(q)) &&
        (!state.type || row.itemType === state.type) &&
        (state.negatifs !== "1" || row.isNegative),
    );
    const factor = sortDirection === "desc" ? -1 : 1;
    filtered.sort((a, b) =>
      sortField === "quantity"
        ? factor * (Number(a.quantity) - Number(b.quantity))
        : factor * a.itemName.localeCompare(b.itemName, "fr"),
    );
    return filtered;
  }, [balances.data, state.q, state.type, state.negatifs, state.sort]);

  const negativeCount = (balances.data ?? []).filter(
    (row) => row.isNegative,
  ).length;
  const start = (state.page - 1) * state.pageSize;
  const columns: DataTableColumn<InventoryBalance>[] = [
    {
      id: "item",
      header: "Article",
      meta: { sortField: "name" },
      cell: ({ row }) => (
        <span className={styles.item}>
          <span>{row.original.itemName}</span>
          <Badge tone={row.original.itemType === "PRODUCT" ? "info" : "accent"}>
            {typeLabel[row.original.itemType]}
          </Badge>
        </span>
      ),
    },
    {
      id: "quantity",
      header: "Quantité",
      meta: { align: "right", sortField: "quantity" },
      cell: ({ row }) => (
        <StockBadge
          quantity={row.original.quantity}
          unit={row.original.unitSymbol}
        />
      ),
    },
    {
      id: "lastMovement",
      header: "Dernier mouvement",
      accessorFn: (row) =>
        row.lastMovementAt ? formatDateTime(row.lastMovementAt) : "—",
    },
  ];

  const openDetail = (row: InventoryBalance) =>
    navigate(
      row.itemType === "PRODUCT"
        ? `/produits/${row.itemId}`
        : `/matieres-premieres/${row.itemId}`,
    );

  return (
    <>
      <PageHeader
        eyebrow="Stock"
        title="Stock"
        description="Emplacement principal"
        actions={
          <>
            <PermissionGate
              permissions={permissions}
              permission="inventory.adjust"
            >
              <Button
                leftIcon={<SlidersHorizontal />}
                onClick={() => setDialog("adjustment")}
              >
                Ajustement
              </Button>
            </PermissionGate>
            <PermissionGate
              permissions={permissions}
              permission="inventory.opening_stock"
            >
              <Button
                variant="secondary"
                leftIcon={<Plus />}
                onClick={() => setDialog("opening")}
              >
                Stock d'ouverture
              </Button>
            </PermissionGate>
          </>
        }
      />
      {negativeCount > 0 && state.negatifs !== "1" ? (
        <p className={styles.banner} role="status">
          <AlertTriangle aria-hidden="true" />
          <Link to="/stock?negatifs=1">
            {plural(negativeCount, "article")} en stock négatif
          </Link>
        </p>
      ) : null}
      <FilterBar
        search={state.q}
        onSearchChange={(q) => setState({ q, page: 1 })}
        searchPlaceholder="Rechercher un article"
        activeCount={(state.type ? 1 : 0) + (state.negatifs === "1" ? 1 : 0)}
        onReset={() => setState({ type: "", negatifs: "0", page: 1 })}
        filters={
          <>
            <Select
              aria-label="Type d'article"
              placeholder="Tous les types"
              clearable
              value={state.type || null}
              onValueChange={(type) => setState({ type: type ?? "", page: 1 })}
              options={[
                { value: "PRODUCT", label: "Produits" },
                { value: "RAW_MATERIAL", label: "Matières premières" },
              ]}
            />
            <SegmentedControl
              label="Stocks négatifs"
              size="sm"
              value={state.negatifs}
              onValueChange={(negatifs) => setState({ negatifs, page: 1 })}
              options={[
                { value: "0", label: "Tous" },
                { value: "1", label: "Négatifs seulement" },
              ]}
            />
          </>
        }
      />
      <DataTable<InventoryBalance>
        label="Stock"
        columns={columns}
        data={rows.slice(start, start + state.pageSize)}
        total={rows.length}
        page={state.page}
        pageSize={state.pageSize}
        sort={{
          field: state.sort.split(":")[0] ?? "name",
          direction: state.sort.endsWith(":desc") ? "desc" : "asc",
        }}
        onChange={(change) =>
          setState({
            ...(change.page ? { page: change.page } : {}),
            ...(change.pageSize ? { pageSize: change.pageSize } : {}),
            ...(change.sort
              ? { sort: `${change.sort.field}:${change.sort.direction}` }
              : {}),
          })
        }
        loading={balances.isPending}
        error={balances.error}
        onRetry={() => void balances.refetch()}
        empty={{
          title:
            state.negatifs === "1"
              ? "Aucun stock négatif"
              : "Aucun article en stock",
          description:
            state.negatifs === "1"
              ? "Tous les articles ont une quantité positive ou nulle."
              : "Enregistrez un stock d'ouverture ou un achat pour alimenter le stock.",
        }}
        getRowId={(row) => `${row.itemType}:${row.itemId}`}
        onRowClick={openDetail}
        mobileCard={(row) => (
          <>
            <span className={styles.item}>
              <strong>{row.itemName}</strong>
              <Badge tone={row.itemType === "PRODUCT" ? "info" : "accent"}>
                {typeLabel[row.itemType]}
              </Badge>
            </span>
            <StockBadge quantity={row.quantity} unit={row.unitSymbol} />
            <span className={styles.muted}>
              {row.lastMovementAt
                ? `Dernier mouvement ${formatDateTime(row.lastMovementAt)}`
                : "Aucun mouvement"}
            </span>
          </>
        )}
      />
      {dialog ? (
        <StockMovementDialog
          kind={dialog}
          open
          onOpenChange={(open) => !open && setDialog(null)}
        />
      ) : null}
    </>
  );
}
