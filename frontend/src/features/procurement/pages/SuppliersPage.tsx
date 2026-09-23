import { Banknote, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { useState } from "react";
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
import { DropdownMenu } from "../../../components/ui/DropdownMenu/DropdownMenu.js";
import { IconButton } from "../../../components/ui/IconButton/IconButton.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { formatMoney } from "../../../i18n/format.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type { Supplier, SupplierBalanceRow } from "../procurement.api.js";
import { useSupplierBalances } from "../procurement.queries.js";
import { SupplierFormDialog } from "../components/SupplierFormDialog.js";
import { SupplierPaymentDialog } from "../components/SupplierPaymentDialog.js";
import styles from "./ProcurementPages.module.css";

const defaults = { q: "", sort: "name", page: 1, pageSize: 25 };

/// `/fournisseurs` (UI-12): the supplier directory with what is owed to
/// each, from the balances endpoint so no row needs a second request.
export function SuppliersPage() {
  const permissions = useSessionPermissions();
  const navigate = useNavigate();
  const [state, setState] = useUrlState(defaults);
  const [editing, setEditing] = useState<Supplier | null | "new">(null);
  const [paying, setPaying] = useState<Supplier | null>(null);
  const query = useSupplierBalances({
    page: state.page,
    pageSize: state.pageSize,
    q: state.q || undefined,
    sort: state.sort === "balance" ? "balance" : "name",
  });

  const columns: DataTableColumn<SupplierBalanceRow>[] = [
    {
      id: "name",
      header: "Nom",
      meta: { sortField: "name" },
      accessorFn: (row) => row.supplier.name,
    },
    {
      id: "phone",
      header: "Téléphone",
      accessorFn: (row) => row.supplier.phone ?? "—",
    },
    {
      id: "balance",
      header: "Solde dû",
      meta: { align: "right", sortField: "balance" },
      cell: ({ row }) => (
        <span
          className={
            Number(row.original.balanceTnd) > 0 ? styles.due : undefined
          }
        >
          {formatMoney(row.original.balanceTnd)}
        </span>
      ),
    },
    {
      id: "open",
      header: "Achats ouverts",
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className={styles.nameCell}>
          <span className="tabular-nums">{row.original.openPurchaseCount}</span>
          {row.original.overduePurchaseCount > 0 ? (
            <Badge tone="danger">
              {row.original.overduePurchaseCount} en retard
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) => (
        <StatusPill
          status={row.original.supplier.isActive ? "ACTIVE" : "INACTIVE"}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Achats"
        title="Fournisseurs"
        description="Les fournisseurs de matières premières et ce qui leur est dû."
        actions={
          <PermissionGate
            permissions={permissions}
            permission="suppliers.create"
          >
            <Button leftIcon={<Plus />} onClick={() => setEditing("new")}>
              Nouveau fournisseur
            </Button>
          </PermissionGate>
        }
      />
      <FilterBar
        search={state.q}
        onSearchChange={(q) => setState({ q, page: 1 })}
        searchPlaceholder="Rechercher un fournisseur"
      />
      <DataTable<SupplierBalanceRow>
        label="Fournisseurs"
        columns={columns}
        data={query.data?.items ?? []}
        total={query.data?.total ?? 0}
        page={state.page}
        pageSize={state.pageSize}
        sort={{
          field: state.sort,
          direction: state.sort === "balance" ? "desc" : "asc",
        }}
        onChange={(change) =>
          setState({
            ...(change.page ? { page: change.page } : {}),
            ...(change.pageSize ? { pageSize: change.pageSize } : {}),
            ...(change.sort ? { sort: change.sort.field, page: 1 } : {}),
          })
        }
        loading={query.isPending || query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{
          title: "Aucun fournisseur",
          description: state.q
            ? "Modifiez la recherche."
            : "Créez votre premier fournisseur pour enregistrer un achat.",
        }}
        getRowId={(row) => row.supplier.id}
        onRowClick={(row) => navigate(`/fournisseurs/${row.supplier.id}`)}
        rowActions={(row) => {
          const items = [
            {
              id: "edit",
              label: "Modifier",
              icon: <Pencil />,
              onSelect: () => setEditing(row.supplier),
              hidden: !permissions.has("suppliers.update"),
            },
            {
              id: "pay",
              label: "Payer",
              icon: <Banknote />,
              onSelect: () => setPaying(row.supplier),
              hidden:
                !permissions.has("supplier_payments.create") ||
                Number(row.balanceTnd) <= 0,
            },
          ];
          return items.every((item) => item.hidden) ? null : (
            <DropdownMenu
              label="Actions de la ligne"
              trigger={
                <IconButton
                  label="Actions"
                  icon={<MoreHorizontal />}
                  size="sm"
                />
              }
              items={items}
            />
          );
        }}
        mobileCard={(row) => (
          <>
            <span className={styles.cardTop}>
              <strong>{row.supplier.name}</strong>
              <span
                className={
                  Number(row.balanceTnd) > 0 ? styles.due : "tabular-nums"
                }
              >
                {formatMoney(row.balanceTnd)}
              </span>
            </span>
            <span className={styles.muted}>
              {row.supplier.phone ?? "Sans téléphone"} · {row.openPurchaseCount}{" "}
              achat{row.openPurchaseCount > 1 ? "s" : ""} ouvert
              {row.openPurchaseCount > 1 ? "s" : ""}
            </span>
            {row.overduePurchaseCount > 0 ? (
              <Badge tone="danger">{row.overduePurchaseCount} en retard</Badge>
            ) : null}
          </>
        )}
      />
      <SupplierFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        supplier={editing === "new" ? null : editing}
      />
      <SupplierPaymentDialog
        open={paying !== null}
        onOpenChange={(open) => !open && setPaying(null)}
        supplier={paying}
      />
    </>
  );
}
