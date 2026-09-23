import { Plus } from "lucide-react";
import { useState } from "react";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PermissionGate } from "../../../components/patterns/PermissionGate/PermissionGate.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog/ConfirmDialog.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { Tabs } from "../../../components/ui/Tabs/Tabs.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type { Category, Unit } from "../catalog.api.js";
import {
  useCategories,
  useUnits,
  useUpdateCategory,
  useUpdateUnit,
} from "../catalog.queries.js";
import { CategoryFormDialog } from "../components/CategoryFormDialog.js";
import { UnitFormDialog } from "../components/UnitFormDialog.js";
import { RowActions } from "../components/catalogTable.js";

const listAll = {
  page: 1,
  pageSize: 100,
  sort: { field: "name" as const, direction: "asc" as const },
};

/// `/catalogue/parametres` (UI-10): categories and units in two tabs. The
/// product count per category waits for a backend aggregate (see brief).
export function CatalogSettingsPage() {
  const permissions = useSessionPermissions();
  const [state, setState] = useUrlState({
    tab: permissions.has("categories.view") ? "categories" : "units",
  });
  const tabs = [
    permissions.has("categories.view")
      ? { value: "categories", label: "Catégories", content: <CategoriesTab /> }
      : null,
    permissions.has("units.view")
      ? { value: "units", label: "Unités", content: <UnitsTab /> }
      : null,
  ].filter((tab): tab is NonNullable<typeof tab> => tab !== null);

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title="Catégories et unités"
        description="Les référentiels des produits et des quantités."
      />
      <Tabs
        label="Paramètres du catalogue"
        items={tabs}
        value={state.tab}
        onValueChange={(tab) => setState({ tab })}
      />
    </>
  );
}

function CategoriesTab() {
  const permissions = useSessionPermissions();
  const toast = useToast();
  const query = useCategories({ ...listAll });
  const update = useUpdateCategory();
  const [editing, setEditing] = useState<Category | null | "new">(null);
  const [toggling, setToggling] = useState<Category | null>(null);
  const columns: DataTableColumn<Category>[] = [
    { id: "name", header: "Nom", accessorFn: (row) => row.name },
    {
      id: "description",
      header: "Description",
      accessorFn: (row) => row.description ?? "—",
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
      <PermissionGate permissions={permissions} permission="categories.manage">
        <p
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: "var(--space-3)",
          }}
        >
          <Button
            size="sm"
            leftIcon={<Plus />}
            onClick={() => setEditing("new")}
          >
            Nouvelle catégorie
          </Button>
        </p>
      </PermissionGate>
      <DataTable<Category>
        label="Catégories"
        columns={columns}
        data={query.data?.items ?? []}
        total={query.data?.total ?? 0}
        page={1}
        pageSize={100}
        onChange={() => undefined}
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{
          title: "Aucune catégorie",
          description: "Créez une catégorie pour classer les produits.",
        }}
        getRowId={(row) => row.id}
        rowActions={(row) => (
          <RowActions
            permissions={permissions}
            isActive={row.isActive}
            editPermission="categories.manage"
            activatePermission="categories.manage"
            onEdit={() => setEditing(row)}
            onToggleActivation={() => setToggling(row)}
          />
        )}
        mobileCard={(row) => (
          <>
            <strong>{row.name}</strong>
            {row.description ? <span>{row.description}</span> : null}
            <StatusPill
              status={row.isActive ? "ACTIVE" : "INACTIVE"}
              label={row.isActive ? "Active" : "Inactive"}
            />
          </>
        )}
      />
      <CategoryFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        category={editing === "new" ? null : editing}
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
        loading={update.isPending}
        impact={
          toggling?.isActive ? (
            <p>
              La catégorie ne sera plus proposée pour les nouveaux produits. Les
              produits existants la conservent.
            </p>
          ) : (
            <p>La catégorie sera de nouveau proposée.</p>
          )
        }
        onConfirm={() => {
          if (!toggling) return;
          update.mutate(
            { categoryId: toggling.id, isActive: !toggling.isActive },
            {
              onSuccess: () => {
                toast.success("Catégorie mise à jour", toggling.name);
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

function UnitsTab() {
  const permissions = useSessionPermissions();
  const toast = useToast();
  const query = useUnits({ ...listAll });
  const update = useUpdateUnit();
  const [editing, setEditing] = useState<Unit | null | "new">(null);
  const [toggling, setToggling] = useState<Unit | null>(null);
  const columns: DataTableColumn<Unit>[] = [
    { id: "code", header: "Code", accessorFn: (row) => row.code },
    { id: "name", header: "Nom", accessorFn: (row) => row.name },
    { id: "symbol", header: "Symbole", accessorFn: (row) => row.symbol },
    {
      id: "precision",
      header: "Précision",
      meta: { align: "right" },
      accessorFn: (row) => String(row.precision),
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
      <PermissionGate permissions={permissions} permission="units.manage">
        <p
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: "var(--space-3)",
          }}
        >
          <Button
            size="sm"
            leftIcon={<Plus />}
            onClick={() => setEditing("new")}
          >
            Nouvelle unité
          </Button>
        </p>
      </PermissionGate>
      <DataTable<Unit>
        label="Unités"
        columns={columns}
        data={query.data?.items ?? []}
        total={query.data?.total ?? 0}
        page={1}
        pageSize={100}
        onChange={() => undefined}
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{
          title: "Aucune unité",
          description:
            "Créez une unité (kg, pièce, litre) pour mesurer les quantités.",
        }}
        getRowId={(row) => row.id}
        rowActions={(row) => (
          <RowActions
            permissions={permissions}
            isActive={row.isActive}
            editPermission="units.manage"
            activatePermission="units.manage"
            onEdit={() => setEditing(row)}
            onToggleActivation={() => setToggling(row)}
          />
        )}
        mobileCard={(row) => (
          <>
            <strong>
              {row.name} ({row.symbol})
            </strong>
            <span>Précision : {row.precision}</span>
            <StatusPill
              status={row.isActive ? "ACTIVE" : "INACTIVE"}
              label={row.isActive ? "Active" : "Inactive"}
            />
          </>
        )}
      />
      <UnitFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        unit={editing === "new" ? null : editing}
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
        loading={update.isPending}
        impact={
          toggling?.isActive ? (
            <p>
              L'unité ne sera plus proposée pour les nouveaux articles ni les
              conversions. Les articles existants la conservent.
            </p>
          ) : (
            <p>L'unité sera de nouveau proposée.</p>
          )
        }
        onConfirm={() => {
          if (!toggling) return;
          update.mutate(
            { unitId: toggling.id, isActive: !toggling.isActive },
            {
              onSuccess: () => {
                toast.success("Unité mise à jour", toggling.name);
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
