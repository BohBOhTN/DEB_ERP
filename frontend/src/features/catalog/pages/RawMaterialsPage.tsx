import { Plus } from "lucide-react";
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
import { Select } from "../../../components/ui/Select/Select.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { Tooltip } from "../../../components/ui/Tooltip/Tooltip.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type { RawMaterial } from "../catalog.api.js";
import {
  useRawMaterials,
  useSetRawMaterialActivation,
} from "../catalog.queries.js";
import { RawMaterialFormDialog } from "../components/RawMaterialFormDialog.js";
import {
  RowActions,
  activeFilter,
  listDefaults,
  sortFrom,
} from "../components/catalogTable.js";
import styles from "./CatalogPages.module.css";

export function conversionsSummary(rawMaterial: RawMaterial): string {
  return rawMaterial.conversions
    .filter((conversion) => conversion.isActive)
    .map(
      (conversion) =>
        `1 ${conversion.unit.symbol} = ${conversion.factorToBase.replace(/\.?0+$/, "").replace(".", ",")} ${rawMaterial.baseUnit.symbol}`,
    )
    .join(" · ");
}

/// `/matieres-premieres` (UI-10): same anatomy as the products list.
export function RawMaterialsPage() {
  const permissions = useSessionPermissions();
  const navigate = useNavigate();
  const toast = useToast();
  const [state, setState] = useUrlState(listDefaults);
  const [editing, setEditing] = useState<RawMaterial | null | "new">(null);
  const [toggling, setToggling] = useState<RawMaterial | null>(null);
  const activation = useSetRawMaterialActivation();
  const query = useRawMaterials({
    page: state.page,
    pageSize: state.pageSize,
    q: state.q || undefined,
    sort: sortFrom(state.sort),
    isActive: activeFilter(state.isActive),
  });

  const columns: DataTableColumn<RawMaterial>[] = [
    {
      id: "name",
      header: "Nom",
      meta: { sortField: "name" },
      accessorFn: (row) => row.name,
    },
    {
      id: "unit",
      header: "Unité de base",
      accessorFn: (row) => `${row.baseUnit.name} (${row.baseUnit.symbol})`,
    },
    {
      id: "conversions",
      header: "Conversions",
      cell: ({ row }) => {
        const count = row.original.conversions.filter(
          (conversion) => conversion.isActive,
        ).length;
        return count === 0 ? (
          <span className={styles.muted}>Aucune</span>
        ) : (
          <Tooltip content={conversionsSummary(row.original)}>
            <span>{count === 1 ? "1 conversion" : `${count} conversions`}</span>
          </Tooltip>
        );
      },
    },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) => (
        <StatusPill
          status={row.original.isActive ? "ACTIVE" : "INACTIVE"}
          label={row.original.isActive ? "Active" : "Inactive"}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title="Matières premières"
        description="Les ingrédients achetés et suivis en stock."
        actions={
          <PermissionGate
            permissions={permissions}
            permission="raw_materials.create"
          >
            <Button leftIcon={<Plus />} onClick={() => setEditing("new")}>
              Nouvelle matière première
            </Button>
          </PermissionGate>
        }
      />
      <FilterBar
        search={state.q}
        onSearchChange={(q) => setState({ q, page: 1 })}
        searchPlaceholder="Rechercher une matière première"
        activeCount={state.isActive !== "true" ? 1 : 0}
        onReset={() => setState({ isActive: "true", page: 1 })}
        filters={
          <Select
            aria-label="Statut"
            value={state.isActive || "all"}
            onValueChange={(value) =>
              setState({
                isActive: value === "all" ? "" : (value ?? "true"),
                page: 1,
              })
            }
            options={[
              { value: "true", label: "Actives" },
              { value: "false", label: "Inactives" },
              { value: "all", label: "Toutes" },
            ]}
          />
        }
      />
      <DataTable<RawMaterial>
        label="Matières premières"
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
          title: "Aucune matière première",
          description:
            "Créez votre première matière première pour enregistrer un achat.",
        }}
        getRowId={(row) => row.id}
        onRowClick={(row) => navigate(`/matieres-premieres/${row.id}`)}
        rowActions={(row) => (
          <RowActions
            permissions={permissions}
            isActive={row.isActive}
            editPermission="raw_materials.update"
            activatePermission="raw_materials.activate"
            onEdit={() => setEditing(row)}
            onToggleActivation={() => setToggling(row)}
          />
        )}
        mobileCard={(row) => (
          <>
            <strong>{row.name}</strong>
            <span className={styles.muted}>
              {row.baseUnit.symbol}
              {row.conversions.length > 0
                ? ` · ${conversionsSummary(row)}`
                : ""}
            </span>
            <StatusPill
              status={row.isActive ? "ACTIVE" : "INACTIVE"}
              label={row.isActive ? "Active" : "Inactive"}
            />
          </>
        )}
      />
      <RawMaterialFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        rawMaterial={editing === "new" ? null : editing}
      />
      <ConfirmDialog
        open={toggling !== null}
        title={
          toggling?.isActive
            ? `Désactiver ${toggling.name}`
            : `Réactiver ${toggling?.name ?? ""}`
        }
        tone={toggling?.isActive ? "danger" : "default"}
        confirmLabel={toggling?.isActive ? "Désactiver" : "Réactiver"}
        loading={activation.isPending}
        impact={
          toggling?.isActive ? (
            <p>
              La matière ne pourra plus être choisie dans un achat ni une
              simulation. Le stock et l'historique sont conservés.
            </p>
          ) : (
            <p>La matière pourra de nouveau être achetée.</p>
          )
        }
        onConfirm={() => {
          if (!toggling) return;
          activation.mutate(
            {
              rawMaterialId: toggling.id,
              version: toggling.version,
              isActive: !toggling.isActive,
            },
            {
              onSuccess: (saved) => {
                toast.success(
                  saved.isActive ? "Matière réactivée" : "Matière désactivée",
                  saved.name,
                );
                setToggling(null);
              },
              onError: (error) => toast.fromError(error),
            },
          );
        }}
        onCancel={() => setToggling(null)}
      />
    </>
  );
}
