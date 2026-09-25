import { Banknote, MoreHorizontal, Pencil, Plus, Truck } from "lucide-react";
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
import { DropdownMenu } from "../../../components/ui/DropdownMenu/DropdownMenu.js";
import { IconButton } from "../../../components/ui/IconButton/IconButton.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { formatMoney } from "../../../i18n/format.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type { Distributor } from "../distribution.api.js";
import { useDistributors } from "../distribution.queries.js";
import { DirectSaleDialog } from "../components/DirectSaleDialog.js";
import { DistributorFormDialog } from "../components/DistributorFormDialog.js";
import { DistributorPaymentDialog } from "../components/DistributorPaymentDialog.js";
import styles from "./DistributionPages.module.css";

const defaults = {
  q: "",
  isActive: "true",
  sort: "name:asc",
  page: 1,
  pageSize: 25,
  /// `?vente=directe` opens the direct-sale dialog (the Accueil quick
  /// action, issue 009).
  vente: "",
};

/// `/distributeurs` (UI-16): the directory with what each distributor holds
/// and owes.
export function DistributorsPage() {
  const permissions = useSessionPermissions();
  const navigate = useNavigate();
  const [state, setState] = useUrlState(defaults);
  const [editing, setEditing] = useState<Distributor | null | "new">(null);
  const [paying, setPaying] = useState<Distributor | null>(null);
  const [field, direction] = state.sort.split(":");
  const sort = {
    field: field || "name",
    direction: direction === "desc" ? ("desc" as const) : ("asc" as const),
  };
  const query = useDistributors({
    page: state.page,
    pageSize: state.pageSize,
    q: state.q || undefined,
    sort,
    isActive: state.isActive === "" ? undefined : state.isActive === "true",
  });

  const columns: DataTableColumn<Distributor>[] = [
    {
      id: "name",
      header: "Nom",
      meta: { sortField: "name" },
      accessorFn: (row) => row.name,
    },
    { id: "phone", header: "Téléphone", accessorFn: (row) => row.phone ?? "—" },
    {
      id: "held",
      header: "En dépôt",
      meta: { align: "right" },
      accessorFn: (row) =>
        `${row.heldLineCount ?? 0} ligne${(row.heldLineCount ?? 0) > 1 ? "s" : ""}`,
    },
    {
      id: "balance",
      header: "Solde dû",
      meta: { align: "right" },
      cell: ({ row }) => (
        <span
          className={
            Number(row.original.balanceTnd ?? 0) > 0 ? styles.due : undefined
          }
        >
          {formatMoney(row.original.balanceTnd ?? "0")}
        </span>
      ),
    },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) => (
        <StatusPill status={row.original.isActive ? "ACTIVE" : "INACTIVE"} />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Distribution"
        title="Distributeurs"
        description="Les distributeurs, ce qu'ils gardent en dépôt et ce qu'ils doivent."
        actions={
          <>
            <PermissionGate
              permissions={permissions}
              permission="distribution.direct_sale"
            >
              <Button
                variant="secondary"
                leftIcon={<Truck />}
                onClick={() => setState({ vente: "directe" })}
              >
                Vente directe
              </Button>
            </PermissionGate>
            <PermissionGate
              permissions={permissions}
              permission="distributors.create"
            >
              <Button leftIcon={<Plus />} onClick={() => setEditing("new")}>
                Nouveau distributeur
              </Button>
            </PermissionGate>
          </>
        }
      />
      <FilterBar
        search={state.q}
        onSearchChange={(q) => setState({ q, page: 1 })}
        searchPlaceholder="Rechercher un distributeur"
      />
      <DataTable<Distributor>
        label="Distributeurs"
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
          title: "Aucun distributeur",
          description: state.q
            ? "Modifiez la recherche."
            : "Créez votre premier distributeur pour sortir des produits en dépôt-vente.",
        }}
        getRowId={(row) => row.id}
        onRowClick={(row) => navigate(`/distributeurs/${row.id}`)}
        rowActions={(row) => {
          const items = [
            {
              id: "edit",
              label: "Modifier",
              icon: <Pencil />,
              onSelect: () => setEditing(row),
              hidden: !permissions.has("distributors.update"),
            },
            {
              id: "pay",
              label: "Nouveau paiement",
              icon: <Banknote />,
              onSelect: () => setPaying(row),
              hidden:
                !permissions.has("distributor_payments.create") ||
                Number(row.balanceTnd ?? 0) <= 0,
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
              <strong>{row.name}</strong>
              <span
                className={
                  Number(row.balanceTnd ?? 0) > 0 ? styles.due : "tabular-nums"
                }
              >
                {formatMoney(row.balanceTnd ?? "0")}
              </span>
            </span>
            <span className={styles.muted}>
              {row.phone ?? "Sans téléphone"} · {row.heldLineCount ?? 0} ligne
              {(row.heldLineCount ?? 0) > 1 ? "s" : ""} en dépôt
            </span>
          </>
        )}
      />
      <DistributorFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        distributor={editing === "new" ? null : editing}
      />
      <DistributorPaymentDialog
        open={paying !== null}
        onOpenChange={(open) => !open && setPaying(null)}
        distributor={paying}
      />
      <DirectSaleDialog
        open={state.vente === "directe"}
        onOpenChange={(open) => !open && setState({ vente: "" })}
      />
    </>
  );
}
