import { useNavigate } from "react-router-dom";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { FilterBar } from "../../../components/patterns/FilterBar/FilterBar.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { DateInput } from "../../../components/ui/DateInput/DateInput.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { cx } from "../../../lib/cx.js";
import { formatDateTime, formatMoney } from "../../../i18n/format.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import type { PosSession } from "../pos.api.js";
import { useSessions } from "../pos.queries.js";
import styles from "./PosPages.module.css";

const defaults = { from: "", to: "", status: "", page: 1, pageSize: 25 };

export function differenceClass(
  value: string | null | undefined,
): string | undefined {
  const number = Number(value ?? 0);
  return number === 0
    ? undefined
    : number > 0
      ? styles.positive
      : styles.negative;
}

/// `/caisse/sessions` (UI-15): the session history with the drawer figures
/// and the difference in colour.
export function SessionsPage() {
  const navigate = useNavigate();
  const [state, setState] = useUrlState(defaults);
  const query = useSessions({
    page: state.page,
    pageSize: state.pageSize,
    from: state.from || undefined,
    to: state.to || undefined,
    status: (state.status || undefined) as "OPEN" | "CLOSED" | undefined,
    sort: { field: "openedAt", direction: "desc" },
  });

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
      <FilterBar
        activeCount={(state.status ? 1 : 0) + (state.from || state.to ? 1 : 0)}
        onReset={() => setState({ from: "", to: "", status: "", page: 1 })}
        filters={
          <>
            <DateInput
              aria-label="Du"
              value={state.from}
              onChange={(from) => setState({ from, page: 1 })}
            />
            <DateInput
              aria-label="Au"
              value={state.to}
              onChange={(to) => setState({ to, page: 1 })}
            />
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
