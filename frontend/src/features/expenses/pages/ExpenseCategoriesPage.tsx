import { MoreHorizontal, Pencil, Plus, Power } from "lucide-react";
import { useState } from "react";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog/ConfirmDialog.js";
import { DropdownMenu } from "../../../components/ui/DropdownMenu/DropdownMenu.js";
import { IconButton } from "../../../components/ui/IconButton/IconButton.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import type { ExpenseCategory } from "../expenses.api.js";
import {
  useExpenseCategories,
  useUpdateExpenseCategory,
} from "../expenses.queries.js";
import { ExpenseCategoryFormDialog } from "../components/ExpenseCategoryFormDialog.js";
import styles from "./ExpensePages.module.css";

/// `/depenses/categories` (UI-17, EXP-001 to EXP-003): names, how many
/// expenses use each, activation instead of deletion.
export function ExpenseCategoriesPage() {
  const toast = useToast();
  const query = useExpenseCategories();
  const update = useUpdateExpenseCategory();
  const [editing, setEditing] = useState<ExpenseCategory | null | "new">(null);
  const [toggling, setToggling] = useState<ExpenseCategory | null>(null);
  const rows = query.data ?? [];

  const columns: DataTableColumn<ExpenseCategory>[] = [
    { id: "name", header: "Nom", accessorFn: (row) => row.name },
    {
      id: "description",
      header: "Description",
      accessorFn: (row) => row.description ?? "—",
    },
    {
      id: "count",
      header: "Dépenses",
      meta: { align: "right" },
      accessorFn: (row) => row.expenseCount ?? 0,
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
        eyebrow="Finances"
        title="Catégories de dépenses"
        breadcrumbs={[
          { label: "Dépenses", href: "/depenses" },
          { label: "Catégories" },
        ]}
        actions={
          <Button leftIcon={<Plus />} onClick={() => setEditing("new")}>
            Nouvelle catégorie
          </Button>
        }
      />
      <DataTable<ExpenseCategory>
        label="Catégories de dépenses"
        columns={columns}
        data={rows}
        total={rows.length}
        page={1}
        pageSize={Math.max(rows.length, 1)}
        onChange={() => undefined}
        loading={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
        empty={{
          title: "Aucune catégorie",
          description: "Créez une catégorie pour classer les dépenses.",
        }}
        getRowId={(row) => row.id}
        rowActions={(row) => (
          <DropdownMenu
            label="Actions de la ligne"
            trigger={
              <IconButton label="Actions" icon={<MoreHorizontal />} size="sm" />
            }
            items={[
              {
                id: "edit",
                label: "Modifier",
                icon: <Pencil />,
                onSelect: () => setEditing(row),
              },
              {
                id: "toggle",
                label: row.isActive ? "Désactiver" : "Réactiver",
                icon: <Power />,
                onSelect: () => setToggling(row),
                danger: row.isActive,
                separatorBefore: true,
              },
            ]}
          />
        )}
        mobileCard={(row) => (
          <>
            <span className={styles.cardTop}>
              <strong>{row.name}</strong>
              <StatusPill
                status={row.isActive ? "ACTIVE" : "INACTIVE"}
                label={row.isActive ? "Active" : "Inactive"}
              />
            </span>
            <span className={styles.muted}>
              {row.expenseCount ?? 0} dépense
              {(row.expenseCount ?? 0) > 1 ? "s" : ""}
            </span>
          </>
        )}
      />
      <ExpenseCategoryFormDialog
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
              La catégorie ne sera plus proposée pour une nouvelle dépense ;
              l'historique la conserve.
            </p>
          ) : (
            <p>La catégorie sera de nouveau proposée pour les dépenses.</p>
          )
        }
        onConfirm={() => {
          if (!toggling) return;
          update.mutate(
            {
              categoryId: toggling.id,
              version: toggling.version,
              isActive: !toggling.isActive,
            },
            {
              onSuccess: (category) => {
                toast.success(
                  category.isActive
                    ? "Catégorie réactivée"
                    : "Catégorie désactivée",
                  category.name,
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
