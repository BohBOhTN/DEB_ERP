import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { FilterBar } from "../../../components/patterns/FilterBar/FilterBar.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PeriodFilter } from "../../../components/patterns/PeriodFilter/PeriodFilter.js";
import {
  periodFromParams,
  periodRange,
  periodToParams,
} from "../../../lib/dates/periodRange.js";
import { Badge } from "../../../components/ui/Badge/Badge.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { formatDateTime, formatQuantity } from "../../../i18n/format.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import type {
  InventoryMovement,
  InventoryMovementType,
} from "../inventory.api.js";
import { useMovements } from "../inventory.queries.js";
import {
  movementTypeLabels,
  sourcePath,
  sourceTypeLabels,
} from "../movementLabels.js";
import { ItemCombobox } from "../components/ItemCombobox.js";
import type { PickedItem } from "../inventory.schemas.js";
import styles from "./MovementsPage.module.css";

const defaults = {
  itemId: "",
  itemLabel: "",
  type: "",
  period: "today",
  from: "",
  to: "",
  sort: "occurredAt:desc",
  page: 1,
  pageSize: 25,
};

/// `/stock/mouvements` (UI-11): the movement ledger with filters in the URL.
export function MovementsPage() {
  const [state, setState] = useUrlState(defaults);
  const period = periodFromParams(state, "today");
  const range = periodRange(period);
  const query = useMovements({
    page: state.page,
    pageSize: state.pageSize,
    sort: {
      field: "occurredAt",
      direction: state.sort.endsWith(":asc") ? "asc" : "desc",
    },
    itemId: state.itemId || undefined,
    movementType: (state.type || undefined) as
      InventoryMovementType | undefined,
    from: range.from || undefined,
    to: range.to || undefined,
  });
  const activeCount =
    (state.itemId ? 1 : 0) +
    (state.type ? 1 : 0) +
    (period.preset !== "today" ? 1 : 0);

  const pickedItem: PickedItem | null = state.itemId
    ? {
        itemType: "PRODUCT",
        itemId: state.itemId,
        label: state.itemLabel || "Article",
        unitSymbol: "",
        currentQuantity: "0",
      }
    : null;

  const columns: DataTableColumn<InventoryMovement>[] = [
    {
      id: "date",
      header: "Date",
      meta: { sortField: "occurredAt", width: "160px" },
      accessorFn: (row) => formatDateTime(row.occurredAt),
    },
    {
      id: "item",
      header: "Article",
      accessorFn: (row) => row.itemNameSnapshot,
    },
    {
      id: "type",
      header: "Type",
      cell: ({ row }) => <MovementTypeBadge movement={row.original} />,
    },
    {
      id: "quantity",
      header: "Quantité",
      meta: { align: "right" },
      cell: ({ row }) => <SignedQuantity movement={row.original} />,
    },
    {
      id: "source",
      header: "Source",
      cell: ({ row }) => <SourceLink movement={row.original} />,
    },
    {
      id: "actor",
      header: "Par",
      accessorFn: (row) => row.createdBy?.displayName ?? "—",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Stock"
        title="Mouvements"
        description="Chaque entrée et sortie de stock, avec sa source."
      />
      <PeriodFilter
        value={period}
        onChange={(next) => setState({ ...periodToParams(next), page: 1 })}
      />
      <FilterBar
        activeCount={activeCount}
        onReset={() =>
          setState({
            itemId: "",
            itemLabel: "",
            type: "",
            period: "today",
            from: "",
            to: "",
            page: 1,
          })
        }
        filters={
          <>
            <ItemCombobox
              aria-label="Article"
              value={pickedItem}
              onChange={(item) =>
                setState({
                  itemId: item?.itemId ?? "",
                  itemLabel: item?.label ?? "",
                  page: 1,
                })
              }
            />
            <Select
              aria-label="Type de mouvement"
              placeholder="Tous les types"
              clearable
              value={state.type || null}
              onValueChange={(type) => setState({ type: type ?? "", page: 1 })}
              options={(
                Object.keys(movementTypeLabels) as InventoryMovementType[]
              ).map((value) => ({ value, label: movementTypeLabels[value] }))}
            />
          </>
        }
      />
      <DataTable<InventoryMovement>
        label="Mouvements de stock"
        columns={columns}
        data={query.data?.items ?? []}
        total={query.data?.total ?? 0}
        page={state.page}
        pageSize={state.pageSize}
        sort={{
          field: "occurredAt",
          direction: state.sort.endsWith(":asc") ? "asc" : "desc",
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
        loading={query.isPending || query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{
          title: "Aucun mouvement",
          description:
            activeCount > 0
              ? "Modifiez les filtres pour afficher des mouvements."
              : "Les achats, ventes et ajustements apparaîtront ici.",
        }}
        getRowId={(row) => row.id}
        mobileCard={(row) => (
          <>
            <span className={styles.cardTop}>
              <strong>{row.itemNameSnapshot}</strong>
              <SignedQuantity movement={row} />
            </span>
            <MovementTypeBadge movement={row} />
            <span className={styles.muted}>
              {formatDateTime(row.occurredAt)}
              {row.createdBy ? ` · ${row.createdBy.displayName}` : ""}
            </span>
            <SourceLink movement={row} />
          </>
        )}
      />
    </>
  );
}

function MovementTypeBadge({ movement }: { movement: InventoryMovement }) {
  const positive = !movement.quantityDelta.startsWith("-");

  return (
    <Badge
      tone={positive ? "success" : "warning"}
      icon={positive ? <ArrowDownLeft /> : <ArrowUpRight />}
    >
      {movementTypeLabels[movement.movementType] ?? movement.movementType}
    </Badge>
  );
}

function SignedQuantity({ movement }: { movement: InventoryMovement }) {
  const negative = movement.quantityDelta.startsWith("-");
  const unit = movement.unitNameSnapshot;

  return (
    <span
      className={`${styles.quantity} ${negative ? styles.negative : styles.positive} tabular-nums`}
    >
      {negative ? "−" : "+"}
      {formatQuantity(movement.quantityDelta.replace(/^-/, ""), unit)}
    </span>
  );
}

function SourceLink({ movement }: { movement: InventoryMovement }) {
  const label = sourceTypeLabels[movement.sourceType] ?? movement.sourceType;
  const path = sourcePath(movement.sourceType);
  const text = movement.sourceReference
    ? `${label} ${movement.sourceReference}`
    : movement.reason
      ? `${label} · ${movement.reason}`
      : label;

  return path && movement.sourceReference ? (
    <Link to={path}>{text}</Link>
  ) : (
    <span>{text}</span>
  );
}
