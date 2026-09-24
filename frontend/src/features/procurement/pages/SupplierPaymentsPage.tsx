import { MoreHorizontal, Plus, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { FilterBar } from "../../../components/patterns/FilterBar/FilterBar.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PermissionGate } from "../../../components/patterns/PermissionGate/PermissionGate.js";
import { ReversePaymentDialog } from "../../../components/patterns/ReversePaymentDialog/ReversePaymentDialog.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { DropdownMenu } from "../../../components/ui/DropdownMenu/DropdownMenu.js";
import { IconButton } from "../../../components/ui/IconButton/IconButton.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { formatDate, formatMoney } from "../../../i18n/format.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type { SupplierPayment } from "../procurement.api.js";
import {
  useReverseSupplierPayment,
  useSupplierPayments,
} from "../procurement.queries.js";
import { SupplierCombobox } from "../components/SupplierCombobox.js";
import { SupplierPaymentDialog } from "../components/SupplierPaymentDialog.js";
import styles from "./ProcurementPages.module.css";

const defaults = {
  supplierId: "",
  supplierName: "",
  sort: "paidAt:desc",
  page: 1,
  pageSize: 25,
};

/// `/paiements-fournisseurs` (UI-12): payments made to suppliers and the
/// "Nouveau paiement" dialog with allocations.
export function SupplierPaymentsPage() {
  const permissions = useSessionPermissions();
  const [state, setState] = useUrlState(defaults);
  const [creating, setCreating] = useState(false);
  const [reversing, setReversing] = useState<SupplierPayment | null>(null);
  const reverse = useReverseSupplierPayment();
  const toast = useToast();
  const [field, direction] = state.sort.split(":");
  const sort = {
    field: field || "paidAt",
    direction: direction === "asc" ? ("asc" as const) : ("desc" as const),
  };
  const query = useSupplierPayments({
    page: state.page,
    pageSize: state.pageSize,
    sort,
    supplierId: state.supplierId || undefined,
  });

  const columns: DataTableColumn<SupplierPayment>[] = [
    {
      id: "date",
      header: "Date",
      meta: { sortField: "paidAt" },
      accessorFn: (row) => formatDate(row.paidAt),
    },
    {
      id: "supplier",
      header: "Fournisseur",
      cell: ({ row }) => (
        <Link to={`/fournisseurs/${row.original.supplierId}`}>
          {row.original.supplier.name}
        </Link>
      ),
    },
    {
      id: "amount",
      header: "Montant",
      meta: { align: "right", sortField: "amountTnd" },
      accessorFn: (row) => formatMoney(row.amountTnd),
    },
    {
      id: "allocations",
      header: "Affectations",
      meta: { align: "right" },
      accessorFn: (row) => row.allocations.length,
    },
    {
      id: "reference",
      header: "Référence",
      accessorFn: (row) => row.reference ?? "—",
    },
    {
      id: "state",
      header: "État",
      cell: ({ row }) =>
        row.original.reversedAt ? (
          <StatusPill status="CANCELLED" label="Annulé" />
        ) : (
          <StatusPill status="POSTED" label="Réglé" />
        ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Achats"
        title="Paiements fournisseurs"
        description="Les paiements faits aux fournisseurs et leur affectation aux achats."
        actions={
          <PermissionGate
            permissions={permissions}
            permission="supplier_payments.create"
          >
            <Button leftIcon={<Plus />} onClick={() => setCreating(true)}>
              Nouveau paiement
            </Button>
          </PermissionGate>
        }
      />
      <FilterBar
        activeCount={state.supplierId ? 1 : 0}
        onReset={() => setState({ supplierId: "", supplierName: "", page: 1 })}
        filters={
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
        }
      />
      <DataTable<SupplierPayment>
        label="Paiements fournisseurs"
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
          title: "Aucun paiement",
          description: "Les paiements faits aux fournisseurs apparaîtront ici.",
        }}
        getRowId={(row) => row.id}
        mobileCard={(row) => (
          <>
            <span className={styles.cardTop}>
              <strong>{row.supplier.name}</strong>
              <span className="tabular-nums">{formatMoney(row.amountTnd)}</span>
            </span>
            <span className={styles.muted}>
              {row.reversedAt ? "Annulé · " : ""}
              {formatDate(row.paidAt)} · {row.allocations.length} affectation
              {row.allocations.length > 1 ? "s" : ""}
              {row.reference ? ` · ${row.reference}` : ""}
            </span>
          </>
        )}
        rowActions={(row) =>
          row.reversedAt ||
          !permissions.has("supplier_payments.create") ? null : (
            <DropdownMenu
              label="Actions de la ligne"
              trigger={
                <IconButton
                  label="Actions"
                  icon={<MoreHorizontal />}
                  variant="ghost"
                  size="sm"
                />
              }
              items={[
                {
                  id: "reverse",
                  label: "Annuler le paiement",
                  icon: <Undo2 />,
                  onSelect: () => setReversing(row),
                },
              ]}
            />
          )
        }
      />
      <SupplierPaymentDialog open={creating} onOpenChange={setCreating} />
      {reversing ? (
        <ReversePaymentDialog
          open
          kind="paiement"
          partyName={reversing.supplier.name}
          amountTnd={reversing.amountTnd}
          paidAt={reversing.paidAt}
          documents={reversing.allocations.map(
            (allocation) =>
              allocation.purchase?.reference ?? allocation.purchaseId,
          )}
          onPost={async (idempotencyKey, reason) => {
            await reverse.mutateAsync({
              paymentId: reversing.id,
              reason,
              idempotencyKey,
            });
            toast.success(
              "Paiement annulé",
              `${formatMoney(reversing.amountTnd)} remis au solde du fournisseur.`,
            );
            setReversing(null);
          }}
          onClose={() => setReversing(null)}
        />
      ) : null}
    </>
  );
}
