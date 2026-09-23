import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { StockBadge } from "../../../components/patterns/StockBadge/StockBadge.js";
import { Timeline } from "../../../components/patterns/Timeline/Timeline.js";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState.js";
import { ErrorState } from "../../../components/ui/ErrorState/ErrorState.js";
import { Skeleton } from "../../../components/ui/Skeleton/Skeleton.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { describeError } from "../../../i18n/errors.js";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatQuantity,
} from "../../../i18n/format.js";
import type {
  InventoryItemType,
  InventoryMovement,
} from "../../inventory/inventory.api.js";
import {
  useBalances,
  useMovements,
} from "../../inventory/inventory.queries.js";
import { movementTypeLabels } from "../../inventory/movementLabels.js";
import {
  listAuditEvents,
  listPurchasesOf,
  type PurchaseRow,
} from "../related.api.js";
import styles from "../pages/CatalogPages.module.css";

/// The tabs shared by the product and raw material detail pages.

export function StockTab({
  itemType,
  itemId,
  unitSymbol,
  tracked = true,
}: {
  itemType: InventoryItemType;
  itemId: string;
  unitSymbol: string;
  tracked?: boolean;
}) {
  const balances = useBalances();

  if (!tracked) {
    return (
      <EmptyState
        size="sm"
        title="Stock non suivi"
        description="Ce produit n'a pas de stock : il est vendu sans décompte."
      />
    );
  }

  if (balances.isPending) {
    return <Skeleton variant="kpi" />;
  }

  const balance = balances.data?.find(
    (row) => row.itemType === itemType && row.itemId === itemId,
  );

  return (
    <div className={styles.stockRow}>
      <span>Quantité en stock :</span>
      <StockBadge quantity={balance?.quantity ?? "0"} unit={unitSymbol} />
      <span className={styles.muted}>
        {balance?.lastMovementAt
          ? `Dernier mouvement ${formatDateTime(balance.lastMovementAt)}`
          : "Aucun mouvement enregistré."}
      </span>
      <Link to={`/stock/mouvements?itemId=${itemId}`}>Voir les mouvements</Link>
    </div>
  );
}

export function MovementsTab({ itemId }: { itemId: string }) {
  const [page, setPage] = useState(1);
  const query = useMovements({
    page,
    pageSize: 10,
    itemId,
    sort: { field: "occurredAt", direction: "desc" },
  });
  const columns: DataTableColumn<InventoryMovement>[] = [
    {
      id: "date",
      header: "Date",
      accessorFn: (row) => formatDateTime(row.occurredAt),
    },
    {
      id: "type",
      header: "Type",
      accessorFn: (row) =>
        movementTypeLabels[row.movementType] ?? row.movementType,
    },
    {
      id: "quantity",
      header: "Quantité",
      meta: { align: "right" },
      accessorFn: (row) =>
        `${row.quantityDelta.startsWith("-") ? "−" : "+"}${formatQuantity(row.quantityDelta.replace(/^-/, ""), row.unitNameSnapshot)}`,
    },
    {
      id: "reason",
      header: "Motif ou source",
      accessorFn: (row) => row.sourceReference ?? row.reason ?? "—",
    },
  ];

  return (
    <DataTable<InventoryMovement>
      label="Mouvements de l'article"
      columns={columns}
      data={query.data?.items ?? []}
      total={query.data?.total ?? 0}
      page={page}
      pageSize={10}
      onChange={(change) => change.page && setPage(change.page)}
      loading={query.isPending}
      error={query.error}
      onRetry={() => void query.refetch()}
      empty={{
        title: "Aucun mouvement",
        description: "Les entrées et sorties de cet article apparaîtront ici.",
      }}
      getRowId={(row) => row.id}
      mobileCard={(row) => (
        <>
          <strong>
            {movementTypeLabels[row.movementType] ?? row.movementType}
          </strong>
          <span className="tabular-nums">{`${row.quantityDelta.startsWith("-") ? "−" : "+"}${formatQuantity(row.quantityDelta.replace(/^-/, ""), row.unitNameSnapshot)}`}</span>
          <span className={styles.muted}>{formatDateTime(row.occurredAt)}</span>
        </>
      )}
    />
  );
}

export function HistoryTab({
  entity,
  targetId,
}: {
  entity: string;
  targetId: string;
}) {
  const query = useQuery({
    queryKey: ["audit", "target", entity, targetId],
    queryFn: () => listAuditEvents({ entity, targetId, page: 1, pageSize: 20 }),
  });

  if (query.isPending) {
    return <Skeleton variant="table" rows={4} />;
  }

  if (query.isError) {
    const copy = describeError(query.error);
    return (
      <ErrorState
        title={copy.title}
        description={copy.description}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (query.data.items.length === 0) {
    return (
      <EmptyState
        size="sm"
        title="Aucun historique"
        description="Les créations et modifications de cette fiche apparaîtront ici."
      />
    );
  }

  return (
    <Timeline
      title="Historique de la fiche"
      events={query.data.items.map((event) => ({
        id: event.id,
        at: event.createdAt,
        actor: event.actor?.displayName ?? null,
        title: event.actionLabelFr,
        description: event.entityLabelFr,
      }))}
    />
  );
}

export function PurchasesTab({ rawMaterialId }: { rawMaterialId: string }) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["procurement", "purchasesOf", rawMaterialId, page],
    queryFn: () => listPurchasesOf(rawMaterialId, { page, pageSize: 10 }),
  });
  const columns: DataTableColumn<PurchaseRow>[] = [
    {
      id: "reference",
      header: "Référence",
      accessorFn: (row) => row.reference ?? "Brouillon",
    },
    {
      id: "date",
      header: "Date",
      accessorFn: (row) => formatDate(row.purchaseDate),
    },
    {
      id: "supplier",
      header: "Fournisseur",
      accessorFn: (row) => row.supplier.name,
    },
    {
      id: "total",
      header: "Total",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.totalTnd),
    },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) => <StatusPill status={row.original.status} />,
    },
  ];

  return (
    <DataTable<PurchaseRow>
      label="Achats contenant cette matière"
      columns={columns}
      data={query.data?.items ?? []}
      total={query.data?.total ?? 0}
      page={page}
      pageSize={10}
      onChange={(change) => change.page && setPage(change.page)}
      loading={query.isPending}
      error={query.error}
      onRetry={() => void query.refetch()}
      empty={{
        title: "Aucun achat",
        description: "Cette matière première n'apparaît dans aucun achat.",
      }}
      getRowId={(row) => row.id}
      mobileCard={(row) => (
        <>
          <strong>{row.reference ?? "Brouillon"}</strong>
          <span>{row.supplier.name}</span>
          <span className="tabular-nums">{formatMoney(row.totalTnd)}</span>
          <StatusPill status={row.status} />
        </>
      )}
    />
  );
}
