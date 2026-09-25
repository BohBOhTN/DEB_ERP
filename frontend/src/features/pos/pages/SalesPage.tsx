import { useNavigate } from "react-router-dom";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { FilterBar } from "../../../components/patterns/FilterBar/FilterBar.js";
import { KpiGrid } from "../../../components/patterns/KpiGrid/KpiGrid.js";
import { KpiTile } from "../../../components/patterns/KpiTile/KpiTile.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PeriodFilter } from "../../../components/patterns/PeriodFilter/PeriodFilter.js";
import { Badge } from "../../../components/ui/Badge/Badge.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { formatDate, formatMoney, formatTime } from "../../../i18n/format.js";
import {
  periodFromParams,
  periodRange,
  periodToParams,
} from "../../../lib/dates/periodRange.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type { SalePaymentState } from "../../customers/customers.api.js";
import { salePill } from "../../customers/components/customerLabels.js";
import type { Sale } from "../pos.api.js";
import { useSales, useSalesSummary } from "../pos.queries.js";
import { PosCustomerCombobox } from "../components/PosCustomerCombobox.js";
import { SaleRowActions } from "../components/SaleRowActions.js";
import styles from "./PosPages.module.css";

const defaults = {
  period: "today",
  from: "",
  to: "",
  q: "",
  customerId: "",
  customerName: "",
  state: "",
  status: "",
  sessionId: "",
  sort: "soldAt:desc",
  page: 1,
  pageSize: 25,
};

/// `/caisse/ventes` (UI-15, issue #44): today's sales by default with their
/// figures above, the shared period filter, a search, the paid state, and
/// on every row the receipt, the remainder to collect and the cancellation.
export function SalesPage() {
  const navigate = useNavigate();
  const permissions = useSessionPermissions();
  const [state, setState] = useUrlState(defaults);
  const [field, direction] = state.sort.split(":");
  const sort = {
    field: field || "soldAt",
    direction: direction === "asc" ? ("asc" as const) : ("desc" as const),
  };
  const period = periodFromParams(state, "today");
  const range = periodRange(period);
  const filters = {
    from: range.from || undefined,
    to: range.to || undefined,
    q: state.q || undefined,
    customerId: state.customerId || undefined,
    paymentState: (state.state || undefined) as SalePaymentState | undefined,
    sessionId: state.sessionId || undefined,
    status: (state.status || undefined) as "POSTED" | "CANCELLED" | undefined,
  };
  const query = useSales({
    page: state.page,
    pageSize: state.pageSize,
    sort,
    ...filters,
  });
  const summary = useSalesSummary(filters);
  const activeCount =
    (state.q ? 1 : 0) +
    (state.customerId ? 1 : 0) +
    (state.state ? 1 : 0) +
    (state.status ? 1 : 0) +
    (period.preset !== "today" ? 1 : 0) +
    (state.sessionId ? 1 : 0);
  const singleDay = range.from !== "" && range.from === range.to;
  const count = (value: number | undefined) => value ?? 0;

  const columns: DataTableColumn<Sale>[] = [
    {
      id: "reference",
      header: "Référence",
      accessorFn: (row) => row.reference,
    },
    {
      id: "time",
      header: singleDay ? "Heure" : "Date",
      meta: { sortField: "soldAt" },
      accessorFn: (row) =>
        singleDay
          ? formatTime(row.soldAt)
          : `${formatDate(row.soldAt)} ${formatTime(row.soldAt)}`,
    },
    {
      id: "customer",
      header: "Client",
      accessorFn: (row) => row.customer?.name ?? "Client de passage",
    },
    {
      id: "total",
      header: "Total",
      meta: { align: "right", sortField: "totalTnd" },
      accessorFn: (row) => formatMoney(row.totalTnd),
    },
    {
      id: "paid",
      header: "Payé",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.paidAmountTnd),
    },
    {
      id: "remaining",
      header: "Reste",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.remainingDueTnd),
    },
    {
      id: "state",
      header: "État",
      cell: ({ row }) => <StatusPill {...salePill(row.original)} />,
    },
    {
      id: "cashier",
      header: "Caissier",
      accessorFn: (row) => row.postedBy?.displayName ?? "—",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Ventes"
        title="Ventes"
        description="Les ventes enregistrées à la caisse."
      />
      <KpiGrid columns={4}>
        <KpiTile
          label="Ventes"
          value={count(summary.data?.count)}
          note={`${count(summary.data?.paidCount)} payée${count(summary.data?.paidCount) > 1 ? "s" : ""} · ${count(summary.data?.partiallyPaidCount)} partielle${count(summary.data?.partiallyPaidCount) > 1 ? "s" : ""} · ${count(summary.data?.unpaidCount)} impayée${count(summary.data?.unpaidCount) > 1 ? "s" : ""}`}
          loading={summary.isPending}
          featured
        />
        <KpiTile
          label="Chiffre d'affaires"
          value={formatMoney(summary.data?.totalTnd ?? "0")}
          note={`${count(summary.data?.cancelledCount)} annulée${count(summary.data?.cancelledCount) > 1 ? "s" : ""} hors total`}
          loading={summary.isPending}
        />
        <KpiTile
          label="Encaissé"
          value={formatMoney(summary.data?.paidTnd ?? "0")}
          loading={summary.isPending}
        />
        <KpiTile
          label="Reste à encaisser"
          value={formatMoney(summary.data?.remainingTnd ?? "0")}
          note="crédits accordés sur ces ventes"
          loading={summary.isPending}
        />
      </KpiGrid>
      <PeriodFilter
        value={period}
        onChange={(next) => setState({ ...periodToParams(next), page: 1 })}
      />
      <FilterBar
        search={state.q}
        onSearchChange={(q) => setState({ q, page: 1 })}
        searchPlaceholder="Référence ou client"
        activeCount={activeCount}
        onReset={() =>
          setState({
            period: "today",
            from: "",
            to: "",
            q: "",
            customerId: "",
            customerName: "",
            state: "",
            status: "",
            sessionId: "",
            page: 1,
          })
        }
        filters={
          <>
            <PosCustomerCombobox
              aria-label="Client"
              value={
                state.customerId
                  ? {
                      value: state.customerId,
                      label: state.customerName || "Client",
                    }
                  : null
              }
              onChange={(option) =>
                setState({
                  customerId: option?.value ?? "",
                  customerName: option?.label ?? "",
                  page: 1,
                })
              }
            />
            <Select
              aria-label="État"
              placeholder="Tous les états"
              clearable
              value={state.state || null}
              onValueChange={(value) =>
                setState({ state: value ?? "", page: 1 })
              }
              options={[
                { value: "PAID", label: "Payée" },
                { value: "PARTIALLY_PAID", label: "Partielle" },
                { value: "UNPAID", label: "Impayée" },
              ]}
            />
            <Select
              aria-label="Statut"
              placeholder="Validées"
              clearable
              value={state.status || null}
              onValueChange={(value) =>
                setState({ status: value ?? "", page: 1 })
              }
              options={[
                { value: "POSTED", label: "Validées" },
                { value: "CANCELLED", label: "Annulées" },
              ]}
            />
            {state.sessionId ? (
              <Badge tone="info">Ventes d'une session de caisse</Badge>
            ) : null}
          </>
        }
      />
      <DataTable<Sale>
        label="Ventes"
        columns={columns}
        data={query.data?.items ?? []}
        total={query.data?.total ?? 0}
        page={state.page}
        pageSize={state.pageSize}
        sort={sort}
        onChange={(change) =>
          setState({
            ...(change.page ? { page: change.page } : {}),
            ...(change.pageSize ? { pageSize: change.pageSize } : {}),
            ...(change.sort
              ? { sort: `${change.sort.field}:${change.sort.direction}` }
              : {}),
          })
        }
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{
          title: "Aucune vente",
          description:
            activeCount > 0
              ? "Modifiez la période ou les filtres."
              : "Aucune vente aujourd'hui pour le moment.",
        }}
        getRowId={(row) => row.id}
        onRowClick={(row) => navigate(`/caisse/ventes/${row.id}`)}
        rowActions={(row) => (
          <SaleRowActions sale={row} permissions={permissions} />
        )}
        mobileCard={(row) => (
          <>
            <span className={styles.cardTop}>
              <strong>{row.reference}</strong>
              <span className="tabular-nums">{formatMoney(row.totalTnd)}</span>
            </span>
            <span className={styles.muted}>
              {singleDay
                ? formatTime(row.soldAt)
                : `${formatDate(row.soldAt)} ${formatTime(row.soldAt)}`}{" "}
              · {row.customer?.name ?? "Client de passage"}
              {Number(row.remainingDueTnd) > 0
                ? ` · reste ${formatMoney(row.remainingDueTnd)}`
                : ""}
            </span>
            <StatusPill {...salePill(row)} />
          </>
        )}
      />
    </>
  );
}
