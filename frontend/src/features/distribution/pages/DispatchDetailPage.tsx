import { Scale } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { KeyValueList } from "../../../components/patterns/KeyValueList/KeyValueList.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PermissionGate } from "../../../components/patterns/PermissionGate/PermissionGate.js";
import { Badge } from "../../../components/ui/Badge/Badge.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
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
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type { DispatchLine, Settlement } from "../distribution.api.js";
import { useDispatch } from "../distribution.queries.js";
import {
  dispatchStatusPill,
  paymentStatePill,
} from "../components/distributionLabels.js";
import styles from "./DistributionPages.module.css";

/// `/distribution/sorties/:id`: the dispatch lines with their custody
/// equation and the settlements already posted; `Régler` while open.
export function DispatchDetailPage() {
  const { dispatchId = "" } = useParams();
  const permissions = useSessionPermissions();
  const navigate = useNavigate();
  const query = useDispatch(dispatchId);
  const dispatch = query.data;

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

  if (!dispatch) {
    return <Skeleton variant="table" rows={6} />;
  }

  const lineColumns: DataTableColumn<DispatchLine>[] = [
    {
      id: "product",
      header: "Produit",
      accessorFn: (row) => row.productNameSnapshot,
    },
    {
      id: "dispatched",
      header: "Sortie",
      meta: { align: "right" },
      accessorFn: (row) =>
        formatQuantity(row.dispatchedQuantity, row.unitNameSnapshot),
    },
    {
      id: "sold",
      header: "Vendue",
      meta: { align: "right" },
      accessorFn: (row) => formatQuantity(row.settledSoldQuantity),
    },
    {
      id: "returned",
      header: "Retournée",
      meta: { align: "right" },
      accessorFn: (row) => formatQuantity(row.returnedQuantity),
    },
    {
      id: "unaccounted",
      header: "Non justifiée",
      meta: { align: "right" },
      cell: ({ row }) =>
        Number(row.original.unaccountedQuantity) > 0 ? (
          <Badge tone="danger">
            {formatQuantity(row.original.unaccountedQuantity)}
          </Badge>
        ) : (
          <span>{formatQuantity(row.original.unaccountedQuantity)}</span>
        ),
    },
    {
      id: "held",
      header: "Encore en dépôt",
      meta: { align: "right" },
      accessorFn: (row) => formatQuantity(row.stillHeldQuantity),
    },
  ];
  const settlementColumns: DataTableColumn<Settlement>[] = [
    {
      id: "reference",
      header: "Référence",
      accessorFn: (row) => row.reference,
    },
    {
      id: "date",
      header: "Date",
      accessorFn: (row) => formatDateTime(row.settledAt),
    },
    {
      id: "total",
      header: "Vendu",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.totalTnd),
    },
    {
      id: "paid",
      header: "Payé",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.paidAmountTnd),
    },
    {
      id: "state",
      header: "Paiement",
      cell: ({ row }) => (
        <StatusPill {...paymentStatePill(row.original.paymentState)} />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Distribution"
        title={dispatch.reference}
        breadcrumbs={[
          {
            label: "Dépôt-vente",
            href: "/distribution/depot-vente?tab=dispatches",
          },
          { label: dispatch.reference },
        ]}
        badge={<StatusPill {...dispatchStatusPill(dispatch.status)} />}
        actions={
          dispatch.status === "OPEN" ? (
            <PermissionGate
              permissions={permissions}
              permission="distribution.settle"
            >
              <Button
                leftIcon={<Scale />}
                onClick={() =>
                  navigate(`/distribution/sorties/${dispatch.id}/regler`)
                }
              >
                Régler la sortie
              </Button>
            </PermissionGate>
          ) : null
        }
      />
      <div className={styles.stack}>
        <Card>
          <CardHeader as="h2" title="Sortie" />
          <KeyValueList
            columns={2}
            items={[
              {
                label: "Distributeur",
                value: (
                  <Link to={`/distributeurs/${dispatch.distributorId}`}>
                    {dispatch.distributor.name}
                  </Link>
                ),
              },
              {
                label: "Date de sortie",
                value: formatDate(dispatch.dispatchedAt),
              },
              { label: "Notes", value: dispatch.notes },
            ]}
          />
        </Card>
        <Card padding="none">
          <DataTable<DispatchLine>
            label="Lignes de la sortie"
            columns={lineColumns}
            data={dispatch.lines}
            total={dispatch.lines.length}
            page={1}
            pageSize={Math.max(dispatch.lines.length, 1)}
            onChange={() => undefined}
            getRowId={(row) => row.id}
            empty={{ title: "Aucune ligne" }}
            mobileCard={(row) => (
              <>
                <strong>{row.productNameSnapshot}</strong>
                <span className={styles.muted}>
                  Sortie{" "}
                  {formatQuantity(row.dispatchedQuantity, row.unitNameSnapshot)}{" "}
                  · vendue {formatQuantity(row.settledSoldQuantity)} · retournée{" "}
                  {formatQuantity(row.returnedQuantity)} · encore en dépôt{" "}
                  {formatQuantity(row.stillHeldQuantity)}
                </span>
                {Number(row.unaccountedQuantity) > 0 ? (
                  <Badge tone="danger">
                    {formatQuantity(row.unaccountedQuantity)} non justifiées
                  </Badge>
                ) : null}
              </>
            )}
          />
        </Card>
        <Card padding="none">
          <DataTable<Settlement>
            label="Règlements de la sortie"
            columns={settlementColumns}
            data={dispatch.settlements ?? []}
            total={dispatch.settlements?.length ?? 0}
            page={1}
            pageSize={Math.max(dispatch.settlements?.length ?? 0, 1)}
            onChange={() => undefined}
            getRowId={(row) => row.id}
            empty={{
              title: "Aucun règlement",
              description: "Cette sortie n'a pas encore été réglée.",
            }}
            mobileCard={(row) => (
              <>
                <span className={styles.cardTop}>
                  <strong>{row.reference}</strong>
                  <span className="tabular-nums">
                    {formatMoney(row.totalTnd)}
                  </span>
                </span>
                <span className={styles.muted}>
                  {formatDateTime(row.settledAt)}
                </span>
              </>
            )}
          />
        </Card>
      </div>
    </>
  );
}
