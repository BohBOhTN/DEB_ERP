import {
  Banknote,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { FilterBar } from "../../../components/patterns/FilterBar/FilterBar.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PermissionGate } from "../../../components/patterns/PermissionGate/PermissionGate.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog/ConfirmDialog.js";
import { DropdownMenu } from "../../../components/ui/DropdownMenu/DropdownMenu.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { useConfirm } from "../../../lib/hooks/useConfirm.js";
import { IconButton } from "../../../components/ui/IconButton/IconButton.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { formatMoney } from "../../../i18n/format.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type { Customer, CustomerBalanceRow } from "../customers.api.js";
import {
  useCustomerBalances,
  useSetCustomerActive,
} from "../customers.queries.js";
import { CustomerFormDialog } from "../components/CustomerFormDialog.js";
import { CustomerPaymentDialog } from "../components/CustomerPaymentDialog.js";
import styles from "./CustomerPages.module.css";

const defaults = {
  q: "",
  status: "active",
  sort: "name",
  page: 1,
  pageSize: 25,
};

/// `/clients` (UI-13, issue #46): the directory with what each customer
/// owes, their available advance and their open orders, searchable by name
/// or phone, active customers by default; a customer is deactivated, never
/// deleted (CUS-004).
export function CustomersPage() {
  const permissions = useSessionPermissions();
  const navigate = useNavigate();
  const toast = useToast();
  const [state, setState] = useUrlState(defaults);
  const [editing, setEditing] = useState<Customer | null | "new">(null);
  const [paying, setPaying] = useState<Customer | null>(null);
  const activation = useConfirm();
  const setActive = useSetCustomerActive();
  const query = useCustomerBalances({
    page: state.page,
    pageSize: state.pageSize,
    q: state.q || undefined,
    sort: state.sort === "balance" ? "balance" : "name",
    isActive: state.status === "all" ? undefined : state.status !== "inactive",
  });

  const toggleActive = async (customer: Customer) => {
    const deactivating = customer.isActive;
    const { confirmed } = await activation.confirm({
      title: deactivating
        ? `Désactiver ${customer.name} ?`
        : `Réactiver ${customer.name} ?`,
      tone: deactivating ? "danger" : "default",
      confirmLabel: deactivating ? "Désactiver" : "Réactiver",
      impact: deactivating
        ? "Le client ne sera plus proposé pour une vente à crédit, une commande ou un règlement. Ses ventes, commandes et règlements restent consultables."
        : "Le client sera de nouveau proposé pour les ventes à crédit, les commandes et les règlements.",
    });
    if (!confirmed) return;
    try {
      await setActive.mutateAsync({
        customerId: customer.id,
        isActive: !deactivating,
      });
      toast.success(
        deactivating ? "Client désactivé" : "Client réactivé",
        customer.name,
      );
    } catch (error) {
      toast.fromError(error);
    }
  };

  const columns: DataTableColumn<CustomerBalanceRow>[] = [
    {
      id: "name",
      header: "Nom",
      meta: { sortField: "name" },
      accessorFn: (row) => row.customer.name,
    },
    {
      id: "phone",
      header: "Téléphone",
      accessorFn: (row) => row.customer.phone ?? "—",
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
      id: "advance",
      header: "Avance",
      meta: { align: "right" },
      accessorFn: (row) =>
        Number(row.advanceBalanceTnd) > 0
          ? formatMoney(row.advanceBalanceTnd)
          : "",
    },
    {
      id: "orders",
      header: "Commandes ouvertes",
      meta: { align: "right" },
      accessorFn: (row) => row.openOrderCount,
    },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) => (
        <StatusPill
          status={row.original.customer.isActive ? "ACTIVE" : "INACTIVE"}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Ventes"
        title="Clients"
        description="Les clients, ce qu'ils doivent et leurs avances."
        actions={
          <PermissionGate
            permissions={permissions}
            permission="customers.create"
          >
            <Button leftIcon={<Plus />} onClick={() => setEditing("new")}>
              Nouveau client
            </Button>
          </PermissionGate>
        }
      />
      <FilterBar
        search={state.q}
        onSearchChange={(q) => setState({ q, page: 1 })}
        searchPlaceholder="Rechercher par nom ou téléphone"
        activeCount={state.status !== "active" ? 1 : 0}
        onReset={() => setState({ status: "active", page: 1 })}
        filters={
          <Select
            aria-label="Statut"
            value={state.status}
            onValueChange={(value) =>
              setState({ status: value ?? "active", page: 1 })
            }
            options={[
              { value: "active", label: "Actifs" },
              { value: "inactive", label: "Inactifs" },
              { value: "all", label: "Tous" },
            ]}
          />
        }
      />
      <DataTable<CustomerBalanceRow>
        label="Clients"
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
          title: "Aucun client",
          description: state.q
            ? "Modifiez la recherche."
            : "Créez votre premier client pour vendre à crédit ou prendre une commande.",
        }}
        getRowId={(row) => row.customer.id}
        onRowClick={(row) => navigate(`/clients/${row.customer.id}`)}
        rowActions={(row) => {
          const items = [
            {
              id: "view",
              label: "Voir",
              icon: <Eye />,
              onSelect: () => navigate(`/clients/${row.customer.id}`),
            },
            {
              id: "edit",
              label: "Modifier",
              icon: <Pencil />,
              onSelect: () => setEditing(row.customer),
              hidden: !permissions.has("customers.update"),
            },
            {
              id: "pay",
              label: "Encaisser un règlement",
              icon: <Banknote />,
              onSelect: () => setPaying(row.customer),
              hidden:
                !permissions.has("customer_payments.create") ||
                Number(row.balanceTnd) <= 0 ||
                !row.customer.isActive,
            },
            {
              id: "activation",
              label: row.customer.isActive ? "Désactiver" : "Réactiver",
              icon: row.customer.isActive ? <UserMinus /> : <UserPlus />,
              onSelect: () => void toggleActive(row.customer),
              hidden: !permissions.has("customers.deactivate"),
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
              <strong>{row.customer.name}</strong>
              <span
                className={
                  Number(row.balanceTnd) > 0 ? styles.due : "tabular-nums"
                }
              >
                {formatMoney(row.balanceTnd)}
              </span>
            </span>
            <span className={styles.muted}>
              {row.customer.phone ?? "Sans téléphone"}
              {Number(row.advanceBalanceTnd) > 0
                ? ` · avance ${formatMoney(row.advanceBalanceTnd)}`
                : ""}
              {row.openOrderCount > 0
                ? ` · ${row.openOrderCount} commande${row.openOrderCount > 1 ? "s" : ""} ouverte${row.openOrderCount > 1 ? "s" : ""}`
                : ""}
            </span>
          </>
        )}
      />
      <CustomerFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        customer={editing === "new" ? null : editing}
      />
      <CustomerPaymentDialog
        open={paying !== null}
        onOpenChange={(open) => !open && setPaying(null)}
        customer={paying}
      />
      <ConfirmDialog {...activation.dialog} />
    </>
  );
}
