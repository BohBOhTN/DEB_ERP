import { useNavigate } from "react-router-dom";
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
import { Select } from "../../../components/ui/Select/Select.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { cx } from "../../../lib/cx.js";
import { formatDateTime, formatMoney } from "../../../i18n/format.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import { SessionsKpis } from "../components/SessionsKpis.js";
import type { PosSession } from "../pos.api.js";
import { useSessions, useSessionsSummary } from "../pos.queries.js";
import { differenceClass, sessionDuration } from "../sessionFormat.js";
import styles from "./PosPages.module.css";

/// A history opens on the month: "today" is one row on a normal day and
/// none before the till opens (issue 014).
const defaultPeriod = "month";
const defaults = {
  period: defaultPeriod,
  from: "",
  to: "",
  status: "",
  page: 1,
  pageSize: 25,
};

/// `/caisse/sessions` (UI-15): the session history with the drawer figures
/// and the difference in colour, under the totals of the period.
export function SessionsPage() {
  const navigate = useNavigate();
  const [state, setState] = useUrlState(defaults);
  const period = periodFromParams(state, defaultPeriod);
  const range = periodRange(period);
  const filters = {
    from: range.from || undefined,
    to: range.to || undefined,
    status: (state.status || undefined) as "OPEN" | "CLOSED" | undefined,
  };
  const query = useSessions({
    ...filters,
    page: state.page,
    pageSize: state.pageSize,
    sort: { field: "openedAt", direction: "desc" },
  });
  const summary = useSessionsSummary(filters);

  const columns: DataTableColumn<PosSession>[] = [
    {
      id: "opened",
      header: "Ouverte le",
      accessorFn: (row) => formatDateTime(row.openedAt),
    },
    {
      id: "closed",
      header: "Fermée le",
      accessorFn: (row) => (row.closedAt ? formatDateTime(row.closedAt) : "—"),
    },
    {
      id: "duration",
      header: "Durée",
      accessorFn: (row) => sessionDuration(row),
    },
    {
      id: "cashier",
      header: "Caissier",
      accessorFn: (row) => row.openedBy?.displayName ?? "—",
    },
    {
      id: "float",
      header: "Fonds",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.openingCashTnd),
    },
    {
      id: "expected",
      header: "Attendu",
      meta: { align: "right" },
      accessorFn: (row) =>
        row.expectedCashTnd ? formatMoney(row.expectedCashTnd) : "—",
    },
    {
      id: "counted",
      header: "Compté",
      meta: { align: "right" },
      accessorFn: (row) =>
        row.countedCashTnd ? formatMoney(row.countedCashTnd) : "—",
    },
    {
      id: "difference",
      header: "Écart",
      meta: { align: "right" },
      cell: ({ row }) => (
        <span
          className={cx(
            "tabular-nums",
            differenceClass(row.original.cashDifferenceTnd),
          )}
        >
          {row.original.cashDifferenceTnd
            ? formatMoney(row.original.cashDifferenceTnd)
            : "—"}
        </span>
      ),
    },
    {
      id: "sales",
      header: "Ventes",
      meta: { align: "right" },
      accessorFn: (row) =>
        `${row.salesCount ?? 0} · ${formatMoney(row.salesTotalTnd ?? "0")}`,
    },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) => (
        <StatusPill
          status={row.original.status}
          label={row.original.status === "OPEN" ? "Ouverte" : "Fermée"}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Ventes"
        title="Sessions de caisse"
        description="Ouvertures, clôtures et écarts de caisse."
      />
      <PeriodFilter
        value={period}
        onChange={(next) => setState({ ...periodToParams(next), page: 1 })}
      />
      <SessionsKpis summary={summary.data} />
      <FilterBar
        activeCount={
          (state.status ? 1 : 0) + (period.preset !== defaultPeriod ? 1 : 0)
        }
        onReset={() =>
          setState({
            period: defaultPeriod,
            from: "",
            to: "",
            status: "",
            page: 1,
          })
        }
        filters={
          <>
            <Select
              aria-label="Statut"
              placeholder="Tous les statuts"
              clearable
              value={state.status || null}
              onValueChange={(value) =>
                setState({ status: value ?? "", page: 1 })
              }
              options={[
                { value: "OPEN", label: "Ouverte" },
                { value: "CLOSED", label: "Fermée" },
              ]}
            />
          </>
        }
      />
      <DataTable<PosSession>
        label="Sessions de caisse"
        columns={columns}
        data={query.data?.items ?? []}
        total={query.data?.total ?? 0}
        page={state.page}
        pageSize={state.pageSize}
        onChange={(change) =>
          setState({
            ...(change.page ? { page: change.page } : {}),
            ...(change.pageSize ? { pageSize: change.pageSize } : {}),
          })
        }
        loading={query.isPending || query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{
          title: "Aucune session",
          description: "Les sessions de caisse apparaîtront ici.",
        }}
        getRowId={(row) => row.id}
        onRowClick={(row) => navigate(`/caisse/sessions/${row.id}`)}
        mobileCard={(row) => (
          <>
            <span className={styles.cardTop}>
              <strong>{formatDateTime(row.openedAt)}</strong>
              <StatusPill
                status={row.status}
                label={row.status === "OPEN" ? "Ouverte" : "Fermée"}
              />
            </span>
            <span className={styles.muted}>
              {row.openedBy?.displayName ?? "—"} · fonds{" "}
              {formatMoney(row.openingCashTnd)} · {row.salesCount ?? 0} vente
              {(row.salesCount ?? 0) > 1 ? "s" : ""}
            </span>
            {row.cashDifferenceTnd ? (
              <span
                className={cx(
                  "tabular-nums",
                  differenceClass(row.cashDifferenceTnd),
                )}
              >
                Écart {formatMoney(row.cashDifferenceTnd)}
              </span>
            ) : null}
          </>
        )}
      />
    </>
  );
}
