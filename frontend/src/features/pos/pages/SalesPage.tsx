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
import { formatMoney, formatTime } from "../../../i18n/format.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import type { SalePaymentState } from "../../customers/customers.api.js";
import { salePaymentPill } from "../../customers/components/customerLabels.js";
import type { Sale } from "../pos.api.js";
import { useSales } from "../pos.queries.js";
import { PosCustomerCombobox } from "../components/PosCustomerCombobox.js";
import styles from "./PosPages.module.css";

const defaults = {
  period: "today",
  from: "",
  to: "",
  customerId: "",
  customerName: "",
  state: "",
  sessionId: "",
  sort: "soldAt:desc",
  page: 1,
  pageSize: 25,
};

/// `/caisse/ventes` (UI-15): today's sales by default, with what was paid
/// and what remains, the payment state and the cashier.
export function SalesPage() {
  const navigate = useNavigate();
  const [state, setState] = useUrlState(defaults);
  const [field, direction] = state.sort.split(":");
  const sort = {
    field: field || "soldAt",
    direction: direction === "asc" ? ("asc" as const) : ("desc" as const),
  };
  const period = periodFromParams(state, "today");
  const range = periodRange(period);
  const query = useSales({
    page: state.page,
    pageSize: state.pageSize,
    sort,
    from: range.from || undefined,
    to: range.to || undefined,
    customerId: state.customerId || undefined,
    paymentState: (state.state || undefined) as SalePaymentState | undefined,
    sessionId: state.sessionId || undefined,
  });
  const activeCount =
    (state.customerId ? 1 : 0) +
    (state.state ? 1 : 0) +
    (period.preset !== "today" ? 1 : 0) +
    (state.sessionId ? 1 : 0);

  const columns: DataTableColumn<Sale>[] = [
    {
      id: "reference",
      header: "Référence",
      accessorFn: (row) => row.reference,
    },
    {
      id: "time",
      header: "Heure",
      meta: { sortField: "soldAt" },
      accessorFn: (row) => formatTime(row.soldAt),
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
      cell: ({ row }) => (
        <StatusPill
          {...salePaymentPill(row.original.paymentState)}
          label={
            row.original.paymentState === "PAID"
              ? "Payée"
              : row.original.paymentState === "PARTIALLY_PAID"
                ? "Partielle"
                : "Impayée"
          }
        />
      ),
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
      <PeriodFilter
        value={period}
        onChange={(next) => setState({ ...periodToParams(next), page: 1 })}
      />
      <FilterBar
        activeCount={activeCount}
        onReset={() =>
          setState({
            period: "today",
            from: "",
            to: "",
            customerId: "",
            customerName: "",
            state: "",
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
        loading={query.isPending || query.isFetching}
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
        mobileCard={(row) => (
          <>
            <span className={styles.cardTop}>
              <strong>{row.reference}</strong>
              <span className="tabular-nums">{formatMoney(row.totalTnd)}</span>
            </span>
            <span className={styles.muted}>
              {formatTime(row.soldAt)} ·{" "}
              {row.customer?.name ?? "Client de passage"}
              {Number(row.remainingDueTnd) > 0
                ? ` · reste ${formatMoney(row.remainingDueTnd)}`
                : ""}
            </span>
            <StatusPill
              {...salePaymentPill(row.paymentState)}
              label={
                row.paymentState === "PAID"
                  ? "Payée"
                  : row.paymentState === "PARTIALLY_PAID"
                    ? "Partielle"
                    : "Impayée"
              }
            />
          </>
        )}
      />
    </>
  );
}
