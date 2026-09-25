import { PackagePlus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PermissionGate } from "../../../components/patterns/PermissionGate/PermissionGate.js";
import { Badge } from "../../../components/ui/Badge/Badge.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { ErrorState } from "../../../components/ui/ErrorState/ErrorState.js";
import { Skeleton } from "../../../components/ui/Skeleton/Skeleton.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { Tabs } from "../../../components/ui/Tabs/Tabs.js";
import { describeError } from "../../../i18n/errors.js";
import {
  formatDate,
  formatDateTime,
  formatMoney,
} from "../../../i18n/format.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type { Dispatch, Settlement } from "../distribution.api.js";
import {
  useCustody,
  useDispatches,
  useSettlements,
} from "../distribution.queries.js";
import { CustodyBoard } from "../components/CustodyBoard.js";
import {
  dispatchStatusPill,
  paymentStatePill,
} from "../components/distributionLabels.js";
import { safeDecimal } from "../distribution.schemas.js";
import styles from "./DistributionPages.module.css";

type Tab = "held" | "dispatches" | "settlements";
const defaults = { tab: "held", page: 1, pageSize: 25 };

/// `/distribution/depot-vente` (UI-16): the custody board, the dispatches
/// and the settlements, one tab each, the tab in the URL.
export function CustodyPage() {
  const permissions = useSessionPermissions();
  const navigate = useNavigate();
  const [state, setState] = useUrlState(defaults);
  const tab = (
    ["held", "dispatches", "settlements"].includes(state.tab)
      ? state.tab
      : "held"
  ) as Tab;

  return (
    <>
      <PageHeader
        eyebrow="Distribution"
        title="Dépôt-vente"
        description="Ce que chaque distributeur garde en dépôt, les sorties et leurs règlements."
        actions={
          <PermissionGate
            permissions={permissions}
            permission="distribution.dispatch"
          >
            <Button
              leftIcon={<PackagePlus />}
              onClick={() => navigate("/distribution/sorties/nouvelle")}
            >
              Nouvelle sortie
            </Button>
          </PermissionGate>
        }
      />
      <Tabs<Tab>
        label="Dépôt-vente"
        value={tab}
        onValueChange={(next) => setState({ tab: next, page: 1 })}
        items={[
          { value: "held", label: "En dépôt", content: <HeldTab /> },
          {
            value: "dispatches",
            label: "Sorties",
            content: (
              <DispatchesTab
                page={state.page}
                pageSize={state.pageSize}
                onChange={(patch) => setState(patch)}
              />
            ),
          },
          {
            value: "settlements",
            label: "Règlements",
            content: (
              <SettlementsTab
                page={state.page}
                pageSize={state.pageSize}
                onChange={(patch) => setState(patch)}
              />
            ),
          },
        ]}
      />
    </>
  );
}

function HeldTab() {
  const query = useCustody();
  if (query.isPending) return <Skeleton variant="table" rows={4} />;
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
  const held = query.data.items.reduce(
    (sum, line) => sum.plus(line.stillHeldQuantity),
    safeDecimal(0),
  );
  const unaccounted = query.data.discrepancies.reduce(
    (sum, line) => sum.plus(line.unaccountedQuantity),
    safeDecimal(0),
  );
  return (
    <div className={styles.stack}>
      <div className={styles.totals} role="status" aria-label="Totaux du dépôt">
        <span>
          <strong className="tabular-nums">{held.toString()}</strong>{" "}
          <span className={styles.muted}>unités en dépôt</span>
        </span>
        <span>
          <strong className="tabular-nums">{query.data.items.length}</strong>{" "}
          <span className={styles.muted}>lignes</span>
        </span>
        {unaccounted.greaterThan(0) ? (
          <Badge tone="danger">{unaccounted.toString()} non justifiées</Badge>
        ) : (
          <Badge tone="success">Aucun écart</Badge>
        )}
      </div>
      <CustodyBoard items={query.data.items} />
    </div>
  );
}

function DispatchesTab({
  page,
  pageSize,
  onChange,
}: {
  page: number;
  pageSize: number;
  onChange: (patch: { page?: number; pageSize?: number }) => void;
}) {
  const navigate = useNavigate();
  const query = useDispatches({
    page,
    pageSize,
    sort: { field: "dispatchedAt", direction: "desc" },
  });
  const columns: DataTableColumn<Dispatch>[] = [
    {
      id: "reference",
      header: "Référence",
      accessorFn: (row) => row.reference,
    },
    {
      id: "date",
      header: "Date",
      accessorFn: (row) => formatDate(row.dispatchedAt),
    },
    {
      id: "distributor",
      header: "Distributeur",
      accessorFn: (row) => row.distributor.name,
    },
    {
      id: "lines",
      header: "Lignes",
      meta: { align: "right" },
      accessorFn: (row) => row.lines.length,
    },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) => (
        <StatusPill {...dispatchStatusPill(row.original.status)} />
      ),
    },
  ];
  return (
    <DataTable<Dispatch>
      label="Sorties en dépôt-vente"
      columns={columns}
      data={query.data?.items ?? []}
      total={query.data?.total ?? 0}
      page={page}
      pageSize={pageSize}
      onChange={(change) =>
        onChange({
          ...(change.page ? { page: change.page } : {}),
          ...(change.pageSize ? { pageSize: change.pageSize } : {}),
        })
      }
      loading={query.isPending || query.isFetching}
      error={query.error}
      onRetry={() => void query.refetch()}
      empty={{
        title: "Aucune sortie",
        description:
          "Enregistrez une sortie en dépôt-vente pour confier des produits à un distributeur.",
      }}
      getRowId={(row) => row.id}
      onRowClick={(row) => navigate(`/distribution/sorties/${row.id}`)}
      mobileCard={(row) => (
        <>
          <span className={styles.cardTop}>
            <strong>{row.reference}</strong>
            <StatusPill {...dispatchStatusPill(row.status)} />
          </span>
          <span className={styles.muted}>
            {formatDate(row.dispatchedAt)} · {row.distributor.name} ·{" "}
            {row.lines.length} ligne{row.lines.length > 1 ? "s" : ""}
          </span>
        </>
      )}
    />
  );
}

function SettlementsTab({
  page,
  pageSize,
  onChange,
}: {
  page: number;
  pageSize: number;
  onChange: (patch: { page?: number; pageSize?: number }) => void;
}) {
  const query = useSettlements({
    page,
    pageSize,
    sort: { field: "settledAt", direction: "desc" },
  });
  const columns: DataTableColumn<Settlement>[] = [
    {
      id: "reference",
      header: "Référence",
      accessorFn: (row) => row.reference,
    },
    {
      id: "dispatch",
      header: "Sortie",
      cell: ({ row }) =>
        row.original.dispatch ? (
          <Link to={`/distribution/sorties/${row.original.dispatchId}`}>
            {row.original.dispatch.reference}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      id: "date",
      header: "Date",
      accessorFn: (row) => formatDateTime(row.settledAt),
    },
    {
      id: "distributor",
      header: "Distributeur",
      accessorFn: (row) => row.distributor?.name ?? "—",
    },
    {
      id: "total",
      header: "Vendu",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.totalTnd),
    },
    {
      id: "remaining",
      header: "Reste",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.remainingDueTnd),
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
    <DataTable<Settlement>
      label="Règlements de dépôt-vente"
      columns={columns}
      data={query.data?.items ?? []}
      total={query.data?.total ?? 0}
      page={page}
      pageSize={pageSize}
      onChange={(change) =>
        onChange({
          ...(change.page ? { page: change.page } : {}),
          ...(change.pageSize ? { pageSize: change.pageSize } : {}),
        })
      }
      loading={query.isPending || query.isFetching}
      error={query.error}
      onRetry={() => void query.refetch()}
      empty={{
        title: "Aucun règlement",
        description:
          "Réglez une sortie ouverte pour classer les quantités vendues, retournées ou non justifiées.",
      }}
      getRowId={(row) => row.id}
      mobileCard={(row) => (
        <>
          <span className={styles.cardTop}>
            <strong>{row.reference}</strong>
            <span className="tabular-nums">{formatMoney(row.totalTnd)}</span>
          </span>
          <span className={styles.muted}>
            {formatDateTime(row.settledAt)} · {row.distributor?.name ?? ""} ·
            reste {formatMoney(row.remainingDueTnd)}
          </span>
        </>
      )}
    />
  );
}
