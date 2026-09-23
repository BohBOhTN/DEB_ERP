import { Plus } from "lucide-react";
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
import { DateInput } from "../../../components/ui/DateInput/DateInput.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { formatDate, formatMoney } from "../../../i18n/format.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type {
  Purchase,
  PurchasePaymentTerms,
  PurchaseStatus,
} from "../procurement.api.js";
import { usePurchases } from "../procurement.queries.js";
import { paymentTermsLabels } from "../components/procurementLabels.js";
import { SupplierCombobox } from "../components/SupplierCombobox.js";
import styles from "./ProcurementPages.module.css";

const defaults = {
  q: "",
  supplierId: "",
  supplierName: "",
  status: "",
  terms: "",
  from: "",
  to: "",
  overdue: false,
  sort: "purchaseDate:desc",
  page: 1,
  pageSize: 25,
};

function sortFrom(value: string) {
  const [field, direction] = value.split(":");
  return {
    field: field || "purchaseDate",
    direction: direction === "asc" ? ("asc" as const) : ("desc" as const),
  };
}

/// `/achats` (UI-12): purchases with what is paid and what remains, the
/// overdue badge on the due date, and filters in the URL.
export function PurchasesPage() {
  const permissions = useSessionPermissions();
  const navigate = useNavigate();
  const [state, setState] = useUrlState(defaults);
  const query = usePurchases({
    page: state.page,
    pageSize: state.pageSize,
    sort: sortFrom(state.sort),
    supplierId: state.supplierId || undefined,
    status: (state.status || undefined) as PurchaseStatus | undefined,
    paymentTerms: (state.terms || undefined) as
      PurchasePaymentTerms | undefined,
    from: state.from || undefined,
    to: state.to || undefined,
    dueState: state.overdue ? "OVERDUE" : undefined,
  });
  const activeCount =
    (state.supplierId ? 1 : 0) +
    (state.status ? 1 : 0) +
    (state.terms ? 1 : 0) +
    (state.from || state.to ? 1 : 0) +
    (state.overdue ? 1 : 0);

  const columns: DataTableColumn<Purchase>[] = [
    {
      id: "reference",
      header: "Référence",
      accessorFn: (row) => row.reference ?? "Brouillon",
    },
    {
      id: "date",
      header: "Date",
      meta: { sortField: "purchaseDate" },
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
      meta: { align: "right", sortField: "totalTnd" },
      accessorFn: (row) => formatMoney(row.totalTnd),
    },
    {
      id: "paid",
      header: "Payé",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(paidOf(row)),
    },
    {
      id: "balance",
      header: "Reste",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.balanceTnd),
    },
    {
      id: "dueDate",
      header: "Échéance",
      meta: { sortField: "dueDate" },
      cell: ({ row }) => (
        <span className={styles.dateCell}>
          <span>
            {row.original.dueDate ? formatDate(row.original.dueDate) : "—"}
          </span>
          {row.original.paymentState === "OVERDUE" ? (
            <Badge tone="danger">En retard</Badge>
          ) : null}
        </span>
      ),
    },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) => <StatusPill status={row.original.status} />,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Achats"
        title="Achats"
        description="Les achats de matières premières, leur paiement et leur échéance."
        actions={
          <PermissionGate
            permissions={permissions}
            permission="purchases.create"
          >
            <Button
              leftIcon={<Plus />}
              onClick={() => navigate("/achats/nouveau")}
            >
              Nouvel achat
            </Button>
          </PermissionGate>
        }
      />
      <FilterBar
        activeCount={activeCount}
        onReset={() =>
          setState({
            supplierId: "",
            supplierName: "",
            status: "",
            terms: "",
            from: "",
            to: "",
            overdue: false,
            page: 1,
          })
        }
        actions={
          <Button
            variant={state.overdue ? "primary" : "secondary"}
            size="sm"
            aria-pressed={state.overdue}
            onClick={() => setState({ overdue: !state.overdue, page: 1 })}
          >
            En retard
          </Button>
        }
        filters={
          <>
            <SupplierCombobox
              aria-label="Fournisseur"
              placeholder="Tous les fournisseurs"
              value={
                state.supplierId
                  ? {
                      value: state.supplierId,
                      label: state.supplierName || "Fournisseur",
                    }
                  : null
              }
              onChange={(option) =>
                setState({
                  supplierId: option?.value ?? "",
                  supplierName: option?.label ?? "",
                  page: 1,
                })
              }
            />
            <Select
              aria-label="Statut"
              placeholder="Tous les statuts"
              clearable
              value={state.status || null}
              onValueChange={(status) =>
                setState({ status: status ?? "", page: 1 })
              }
              options={[
                { value: "DRAFT", label: "Brouillon" },
                { value: "POSTED", label: "Validé" },
                { value: "CANCELLED", label: "Annulé" },
              ]}
            />
            <Select
              aria-label="Conditions"
              placeholder="Toutes les conditions"
              clearable
              value={state.terms || null}
              onValueChange={(terms) =>
                setState({ terms: terms ?? "", page: 1 })
              }
              options={(["PAID", "PARTIAL", "UNPAID"] as const).map(
                (value) => ({ value, label: paymentTermsLabels[value] }),
              )}
            />
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
          </>
        }
      />
      <DataTable<Purchase>
        label="Achats"
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
          title: "Aucun achat",
          description:
            activeCount > 0
              ? "Modifiez les filtres."
              : "Enregistrez votre premier achat de matières premières.",
        }}
        getRowId={(row) => row.id}
        onRowClick={(row) => navigate(`/achats/${row.id}`)}
        mobileCard={(row) => (
          <>
            <span className={styles.cardTop}>
              <strong>{row.reference ?? "Brouillon"}</strong>
              <span className="tabular-nums">{formatMoney(row.totalTnd)}</span>
            </span>
            <span>{row.supplier.name}</span>
            <span className={styles.muted}>
              {formatDate(row.purchaseDate)} · reste{" "}
              {formatMoney(row.balanceTnd)}
              {row.dueDate ? ` · échéance ${formatDate(row.dueDate)}` : ""}
            </span>
            <span className={styles.nameCell}>
              <StatusPill status={row.status} />
              {row.paymentState === "OVERDUE" ? (
                <Badge tone="danger">En retard</Badge>
              ) : null}
            </span>
          </>
        )}
      />
    </>
  );
}

/// What has been paid so far: the ledger balance against the total for a
/// posted purchase, the planned amount for a draft.
export function paidOf(purchase: Purchase): string {
  if (purchase.status !== "POSTED") {
    return purchase.paidAmountTnd;
  }
  return (Number(purchase.totalTnd) - Number(purchase.balanceTnd)).toFixed(3);
}
