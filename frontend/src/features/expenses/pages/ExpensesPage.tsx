import {
  Ban,
  Check,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings2,
  ShoppingBasket,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BarChart } from "../../../components/patterns/BarChart/BarChart.js";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { FilterBar } from "../../../components/patterns/FilterBar/FilterBar.js";
import { KpiTile } from "../../../components/patterns/KpiTile/KpiTile.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PeriodFilter } from "../../../components/patterns/PeriodFilter/PeriodFilter.js";
import {
  periodFromParams,
  periodRange,
  periodToParams,
} from "../../../lib/dates/periodRange.js";
import { PermissionGate } from "../../../components/patterns/PermissionGate/PermissionGate.js";
import { Sparkline } from "../../../components/patterns/Sparkline/Sparkline.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog/ConfirmDialog.js";
import { DropdownMenu } from "../../../components/ui/DropdownMenu/DropdownMenu.js";
import { IconButton } from "../../../components/ui/IconButton/IconButton.js";
import { Select } from "../../../components/ui/Select/Select.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { formatDate, formatMoney } from "../../../i18n/format.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import {
  categoryLabel,
  type Expense,
  type ExpenseStatus,
} from "../expenses.api.js";
import {
  useExpenseCategories,
  useExpenses,
  useExpenseTotals,
  usePostExpense,
} from "../expenses.queries.js";
import { CancelExpenseDialog } from "../components/CancelExpenseDialog.js";
import { ExpenseFormDialog } from "../components/ExpenseFormDialog.js";
import { expenseStatusPill } from "../components/expenseLabels.js";
import styles from "./ExpensePages.module.css";

const defaults = {
  period: "month",
  from: "",
  to: "",
  categoryId: "",
  status: "",
  /// Issue 018: the expenses of one shopping trip, reached from the
  /// purchase page.
  purchaseId: "",
  sort: "expenseDate:desc",
  page: 1,
  pageSize: 25,
};

/// `/depenses` (UI-17): a monthly report first (total, top categories, the
/// day by day sparkline), then the table with its actions.
export function ExpensesPage() {
  const permissions = useSessionPermissions();
  const navigate = useNavigate();
  const toast = useToast();
  const [state, setState] = useUrlState(defaults);
  // The expense report is monthly by default; the other presets remain one
  // tap away like on every list (issue #41).
  const period = periodFromParams(state, "month");
  const range = periodRange(period);
  const [editing, setEditing] = useState<Expense | null | "new">(null);
  const [posting, setPosting] = useState<Expense | null>(null);
  const [cancelling, setCancelling] = useState<Expense | null>(null);
  const categories = useExpenseCategories();
  const totals = useExpenseTotals({
    from: range.from || undefined,
    to: range.to || undefined,
  });
  const post = usePostExpense();
  const [field, direction] = state.sort.split(":");
  const sort = {
    field: field || "expenseDate",
    direction: direction === "asc" ? ("asc" as const) : ("desc" as const),
  };
  const query = useExpenses({
    page: state.page,
    pageSize: state.pageSize,
    sort,
    categoryId: state.categoryId || undefined,
    status: (state.status || undefined) as ExpenseStatus | undefined,
    purchaseId: state.purchaseId || undefined,
    from: range.from || undefined,
    to: range.to || undefined,
  });
  const activeCount =
    (state.categoryId ? 1 : 0) +
    (state.status ? 1 : 0) +
    (state.purchaseId ? 1 : 0);
  const tripReference = state.purchaseId
    ? (query.data?.items.find((row) => row.purchaseId === state.purchaseId)
        ?.purchase?.reference ?? null)
    : null;
  const topCategories = [...(totals.data?.byCategory ?? [])]
    .sort((a, b) => Number(b.totalTnd) - Number(a.totalTnd))
    .slice(0, 6);

  const columns: DataTableColumn<Expense>[] = [
    {
      id: "reference",
      header: "Référence",
      accessorFn: (row) => row.reference,
    },
    {
      id: "date",
      header: "Date",
      meta: { sortField: "expenseDate" },
      accessorFn: (row) => formatDate(row.expenseDate),
    },
    {
      id: "category",
      header: "Catégorie",
      accessorFn: (row) => row.category.name,
    },
    { id: "label", header: "Libellé", accessorFn: (row) => row.description },
    {
      id: "supplier",
      header: "Fournisseur",
      cell: ({ row }) =>
        row.original.supplier ? (
          <span className={styles.nameCell}>
            {row.original.supplier.name}
            {row.original.purchase ? (
              <Link to={`/achats/${row.original.purchase.id}`}>
                {row.original.purchase.reference ?? "Achat"}
              </Link>
            ) : null}
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "amount",
      header: "Montant",
      meta: { align: "right", sortField: "amountTnd" },
      accessorFn: (row) => formatMoney(row.amountTnd),
    },
    { id: "method", header: "Payé par", accessorFn: () => "Espèces" },
    {
      id: "status",
      header: "Statut",
      cell: ({ row }) => (
        <StatusPill {...expenseStatusPill(row.original.status)} />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Finances"
        title="Dépenses"
        description="Les dépenses de la boulangerie, validées ou en brouillon, sur la période choisie."
        actions={
          <>
            <PermissionGate
              permissions={permissions}
              permission="expenses.create"
            >
              <Button leftIcon={<Plus />} onClick={() => setEditing("new")}>
                Nouvelle dépense
              </Button>
            </PermissionGate>
            <PermissionGate
              permissions={permissions}
              allOf={["purchases.create", "purchases.post", "expenses.create"]}
            >
              <Button
                variant="secondary"
                leftIcon={<ShoppingBasket />}
                onClick={() => navigate("/achats/course")}
              >
                Course fournisseur
              </Button>
            </PermissionGate>
            <PermissionGate
              permissions={permissions}
              permission="expense_categories.manage"
            >
              <Button
                variant="secondary"
                leftIcon={<Settings2 />}
                onClick={() => navigate("/depenses/categories")}
              >
                Catégories
              </Button>
            </PermissionGate>
          </>
        }
      />
      <div className={styles.stack}>
        <PeriodFilter
          value={period}
          onChange={(next) => setState({ ...periodToParams(next), page: 1 })}
        />
        <div className={styles.summary}>
          <KpiTile
            label="Total dépenses"
            value={formatMoney(totals.data?.totalTnd ?? "0")}
            note={`${totals.data?.postedCount ?? 0} dépense${(totals.data?.postedCount ?? 0) > 1 ? "s" : ""} validée${(totals.data?.postedCount ?? 0) > 1 ? "s" : ""}`}
            loading={totals.isPending}
            featured
          />
          <BarChart
            title="Par catégorie"
            orientation="horizontal"
            data={topCategories.map((row) => ({
              label: row.categoryName,
              value: Number(row.totalTnd),
              formatted: formatMoney(row.totalTnd),
            }))}
          />
          <Sparkline
            title="Par jour"
            values={(totals.data?.byDate ?? []).map((row) =>
              Number(row.totalTnd),
            )}
            summary={
              totals.data && totals.data.byDate.length > 0
                ? `${totals.data.byDate.length} jour${totals.data.byDate.length > 1 ? "s" : ""} avec dépenses`
                : "Aucune dépense validée sur la période"
            }
          />
        </div>
        <FilterBar
          activeCount={activeCount}
          onReset={() =>
            setState({ categoryId: "", status: "", purchaseId: "", page: 1 })
          }
          filters={
            <>
              {state.purchaseId ? (
                <Button
                  variant="secondary"
                  size="sm"
                  rightIcon={<X />}
                  onClick={() => setState({ purchaseId: "", page: 1 })}
                  aria-label={`Retirer le filtre sur la course ${tripReference ?? ""}`.trim()}
                >
                  Course {tripReference ?? ""}
                </Button>
              ) : null}
              <Select
                aria-label="Catégorie"
                placeholder="Toutes les catégories"
                clearable
                value={state.categoryId || null}
                onValueChange={(value) =>
                  setState({ categoryId: value ?? "", page: 1 })
                }
                options={(categories.data ?? []).map((category) => ({
                  value: category.id,
                  label: categoryLabel(category),
                }))}
              />
              <Select
                aria-label="Statut"
                placeholder="Tous les statuts"
                clearable
                value={state.status || null}
                onValueChange={(value) =>
                  setState({ status: value ?? "", page: 1 })
                }
                options={[
                  { value: "DRAFT", label: "Brouillon" },
                  { value: "POSTED", label: "Validée" },
                  { value: "CANCELLED", label: "Annulée" },
                ]}
              />
            </>
          }
        />
        <DataTable<Expense>
          label="Dépenses"
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
            title: "Aucune dépense",
            description:
              activeCount > 0
                ? "Modifiez les filtres ou la période."
                : "Aucune dépense sur cette période.",
          }}
          getRowId={(row) => row.id}
          rowActions={(row) => {
            const items = [
              {
                id: "post",
                label: "Valider",
                icon: <Check />,
                onSelect: () => setPosting(row),
                hidden:
                  row.status !== "DRAFT" || !permissions.has("expenses.create"),
              },
              {
                id: "edit",
                label: "Modifier",
                icon: <Pencil />,
                onSelect: () => setEditing(row),
                hidden:
                  row.status !== "DRAFT" || !permissions.has("expenses.create"),
              },
              {
                id: "cancel",
                label: "Annuler",
                icon: <Ban />,
                onSelect: () => setCancelling(row),
                danger: true,
                hidden:
                  row.status !== "POSTED" ||
                  !permissions.has("expenses.cancel"),
                separatorBefore: true,
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
                <strong>{row.description}</strong>
                <span className="tabular-nums">
                  {formatMoney(row.amountTnd)}
                </span>
              </span>
              <span className={styles.muted}>
                {row.reference} · {formatDate(row.expenseDate)} ·{" "}
                {row.category.name}
                {row.supplier ? ` · ${row.supplier.name}` : ""}
              </span>
              <span className={styles.nameCell}>
                <StatusPill {...expenseStatusPill(row.status)} />
                {row.cancellationReason ? (
                  <span className={styles.muted}>
                    Motif : {row.cancellationReason}
                  </span>
                ) : null}
              </span>
            </>
          )}
        />
      </div>
      <ExpenseFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        expense={editing === "new" ? null : editing}
      />
      <ConfirmDialog
        open={posting !== null}
        title={posting ? `Valider ${posting.reference}` : "Valider la dépense"}
        confirmLabel="Valider"
        loading={post.isPending}
        impact={
          <p>
            La dépense{posting ? ` de ${formatMoney(posting.amountTnd)}` : ""}{" "}
            comptera dans les totaux de la période et ne pourra plus être
            modifiée, seulement annulée avec un motif.
          </p>
        }
        onConfirm={() => {
          if (!posting) return;
          post.mutate(
            { expenseId: posting.id, version: posting.version },
            {
              onSuccess: (posted) => {
                toast.success("Dépense validée", posted.reference);
                setPosting(null);
              },
              onError: (error) => toast.fromError(error),
            },
          );
        }}
        onCancel={() => setPosting(null)}
      />
      <CancelExpenseDialog
        expense={cancelling}
        onClose={() => setCancelling(null)}
      />
    </>
  );
}
