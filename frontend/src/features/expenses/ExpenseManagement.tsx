import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { CurrentUser } from "../auth/authApi";
import {
  cancelExpense,
  createExpense,
  createExpenseCategory,
  expenseStatusLabels,
  getExpenseCategories,
  getExpenses,
  getExpenseTotals,
  postExpense,
  updateExpenseCategory,
  type Expense,
  type ExpenseCategory,
  type ExpenseStatus,
  type ExpenseTotals,
} from "./expensesApi";

interface ExpenseManagementProps {
  user: CurrentUser;
}

const statusFilters: Array<{ value: ExpenseStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "Toutes" },
  { value: "DRAFT", label: "Brouillons" },
  { value: "POSTED", label: "Validees" },
  { value: "CANCELLED", label: "Annulees" },
];

export function ExpenseManagement({ user }: ExpenseManagementProps) {
  const permissions = useMemo(
    () => new Set(user.effectivePermissions),
    [user.effectivePermissions],
  );
  const canView = permissions.has("expenses.view");
  const canCreate = permissions.has("expenses.create");
  const canCancel = permissions.has("expenses.cancel");
  const canManageCategories = permissions.has("expense_categories.manage");

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totals, setTotals] = useState<ExpenseTotals | null>(null);
  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | "ALL">(
    "ALL",
  );
  const [categoryName, setCategoryName] = useState("");
  const [expenseForm, setExpenseForm] = useState({
    categoryId: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    amountTnd: "",
    description: "",
    externalReference: "",
    post: true,
  });
  const [cancelReasons, setCancelReasons] = useState<Record<string, string>>(
    {},
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void refresh();
  }, [statusFilter, canView]);

  async function refresh() {
    setError("");
    setIsLoading(true);

    try {
      const [categoryList, expensePage, totalsResult] = await Promise.all([
        canView
          ? getExpenseCategories()
          : Promise.resolve([] as ExpenseCategory[]),
        canView
          ? getExpenses(statusFilter === "ALL" ? {} : { status: statusFilter })
          : Promise.resolve({
              items: [] as Expense[],
              page: 1,
              pageSize: 25,
              total: 0,
              pageCount: 0,
            }),
        canView ? getExpenseTotals() : Promise.resolve(null),
      ]);
      setCategories(categoryList);
      setExpenses(expensePage.items);
      setTotals(totalsResult);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  }

  async function runCommand(action: () => Promise<string>) {
    setIsSubmitting(true);
    setError("");
    setNotice("");

    try {
      setNotice(await action());
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runCommand(async () => {
      await createExpenseCategory({ name: categoryName });
      setCategoryName("");
      return "Categorie creee.";
    });
  }

  async function handleToggleCategory(category: ExpenseCategory) {
    await runCommand(async () => {
      await updateExpenseCategory(category.id, {
        version: category.version,
        isActive: !category.isActive,
      });
      return category.isActive
        ? "Categorie desactivee. L'historique est conserve."
        : "Categorie activee.";
    });
  }

  async function handleCreateExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runCommand(async () => {
      const expense = await createExpense({
        categoryId: expenseForm.categoryId,
        expenseDate: new Date(expenseForm.expenseDate).toISOString(),
        amountTnd: expenseForm.amountTnd,
        description: expenseForm.description,
        externalReference: expenseForm.externalReference || undefined,
        post: expenseForm.post,
      });
      setExpenseForm({
        ...expenseForm,
        amountTnd: "",
        description: "",
        externalReference: "",
      });
      return expenseForm.post
        ? `Depense ${expense.reference} validee.`
        : `Depense ${expense.reference} enregistree en brouillon.`;
    });
  }

  async function handlePost(expense: Expense) {
    await runCommand(async () => {
      await postExpense(expense.id, {
        version: expense.version,
        postedAt: new Date().toISOString(),
      });
      return "Depense validee.";
    });
  }

  async function handleCancel(expense: Expense) {
    const reason = cancelReasons[expense.id]?.trim() ?? "";

    if (!reason) {
      setError("Un motif d'annulation est obligatoire.");
      return;
    }

    await runCommand(async () => {
      await cancelExpense(expense.id, {
        version: expense.version,
        cancelledAt: new Date().toISOString(),
        reason,
      });
      setCancelReasons((current) => ({ ...current, [expense.id]: "" }));
      return "Depense annulee. Elle reste dans l'historique.";
    });
  }

  if (!canView) {
    return (
      <section className="expenses-workspace" aria-labelledby="expenses-title">
        <h2 id="expenses-title">Depenses</h2>
        <p className="status-muted">
          Vous n'avez pas l'autorisation de consulter les depenses.
        </p>
      </section>
    );
  }

  return (
    <section className="expenses-workspace" aria-labelledby="expenses-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Depenses</p>
          <h2 id="expenses-title">Depenses et categories</h2>
        </div>
        <span className="permission-count">{expenses.length}</span>
      </div>

      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p className="status-active">{notice}</p> : null}
      {isLoading ? <p className="status-muted">Chargement...</p> : null}

      <div className="expenses-grid">
        {canCreate ? (
          <div className="panel">
            <div className="panel-heading">
              <h3>Nouvelle depense</h3>
            </div>
            <form className="inline-form" onSubmit={handleCreateExpense}>
              <label className="field">
                Categorie
                <select
                  onChange={(event) =>
                    setExpenseForm({
                      ...expenseForm,
                      categoryId: event.target.value,
                    })
                  }
                  required
                  value={expenseForm.categoryId}
                >
                  <option value="">Selectionnez une categorie</option>
                  {categories
                    .filter((category) => category.isActive)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                Date
                <input
                  onChange={(event) =>
                    setExpenseForm({
                      ...expenseForm,
                      expenseDate: event.target.value,
                    })
                  }
                  required
                  type="date"
                  value={expenseForm.expenseDate}
                />
              </label>
              <label className="field">
                Montant (TND)
                <input
                  min="0.001"
                  onChange={(event) =>
                    setExpenseForm({
                      ...expenseForm,
                      amountTnd: event.target.value,
                    })
                  }
                  required
                  step="0.001"
                  type="number"
                  value={expenseForm.amountTnd}
                />
              </label>
              <label className="field">
                Description
                <input
                  onChange={(event) =>
                    setExpenseForm({
                      ...expenseForm,
                      description: event.target.value,
                    })
                  }
                  required
                  value={expenseForm.description}
                />
              </label>
              <label className="field">
                Reference du justificatif
                <input
                  onChange={(event) =>
                    setExpenseForm({
                      ...expenseForm,
                      externalReference: event.target.value,
                    })
                  }
                  value={expenseForm.externalReference}
                />
              </label>
              <label className="checkbox-field">
                <input
                  checked={expenseForm.post}
                  onChange={(event) =>
                    setExpenseForm({
                      ...expenseForm,
                      post: event.target.checked,
                    })
                  }
                  type="checkbox"
                />
                Valider immediatement
              </label>
              <p className="status-muted">
                Une depense validee entre dans les totaux. Un brouillon reste
                modifiable et ne compte pas.
              </p>
              <button
                className="primary-button"
                disabled={isSubmitting}
                type="submit"
              >
                Enregistrer la depense
              </button>
            </form>
          </div>
        ) : null}

        <div className="panel">
          <div className="panel-heading">
            <h3>Depenses</h3>
            <span>{expenses.length}</span>
          </div>

          <div
            className="filter-row"
            role="group"
            aria-label="Filtrer par statut"
          >
            {statusFilters.map((filter) => (
              <button
                aria-pressed={statusFilter === filter.value}
                className="chip-button"
                key={filter.value}
                onClick={() => setStatusFilter(filter.value)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>

          {expenses.length === 0 ? (
            <p className="status-muted">Aucune depense pour ce filtre.</p>
          ) : (
            <ul className="record-list">
              {expenses.map((expense) => (
                <li className="expense-row" key={expense.id}>
                  <div className="metric-row">
                    <span>
                      {expense.reference} · {expense.description}
                      <small>
                        {expense.category?.name} ·{" "}
                        {formatDate(expense.expenseDate)} ·{" "}
                        {expenseStatusLabels[expense.status]}
                      </small>
                    </span>
                    <strong>{formatTnd(expense.amountTnd)}</strong>
                  </div>

                  {expense.cancellationReason ? (
                    <p className="status-muted">
                      Annulee : {expense.cancellationReason}
                    </p>
                  ) : null}

                  {canCreate && expense.status === "DRAFT" ? (
                    <button
                      className="secondary-button"
                      disabled={isSubmitting}
                      onClick={() => void handlePost(expense)}
                      type="button"
                    >
                      Valider
                    </button>
                  ) : null}

                  {canCancel && expense.status !== "CANCELLED" ? (
                    <div className="inline-form">
                      <label className="field">
                        Motif d'annulation
                        <input
                          onChange={(event) =>
                            setCancelReasons((current) => ({
                              ...current,
                              [expense.id]: event.target.value,
                            }))
                          }
                          value={cancelReasons[expense.id] ?? ""}
                        />
                      </label>
                      <button
                        className="secondary-button"
                        disabled={isSubmitting}
                        onClick={() => void handleCancel(expense)}
                        type="button"
                      >
                        Annuler la depense
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <div className="panel-heading">
            <h3>Totaux</h3>
          </div>
          {!totals ? (
            <p className="status-muted">Aucun total.</p>
          ) : (
            <div className="assignment-panel">
              <div className="metric-row">
                <span>Total valide</span>
                <strong>{formatTnd(totals.totalTnd)}</strong>
              </div>
              <p className="status-muted">
                Les depenses annulees restent dans l'historique mais ne sont
                jamais comptees ici.
              </p>

              <h4>Par categorie</h4>
              {totals.byCategory.length === 0 ? (
                <p className="status-muted">Aucune depense validee.</p>
              ) : (
                totals.byCategory.map((row) => (
                  <div className="metric-row" key={row.categoryId}>
                    <span>{row.categoryName}</span>
                    <strong>{formatTnd(row.totalTnd)}</strong>
                  </div>
                ))
              )}

              <h4>Par date</h4>
              {totals.byDate.length === 0 ? (
                <p className="status-muted">Aucune depense validee.</p>
              ) : (
                totals.byDate.map((row) => (
                  <div className="metric-row" key={row.day}>
                    <span>{formatDate(row.day)}</span>
                    <strong>{formatTnd(row.totalTnd)}</strong>
                  </div>
                ))
              )}
            </div>
          )}

          {canManageCategories ? (
            <>
              <div className="panel-heading">
                <h3>Categories</h3>
                <span>{categories.length}</span>
              </div>
              <form className="inline-form" onSubmit={handleCreateCategory}>
                <label className="field">
                  Nouvelle categorie
                  <input
                    onChange={(event) => setCategoryName(event.target.value)}
                    required
                    value={categoryName}
                  />
                </label>
                <button
                  className="secondary-button"
                  disabled={isSubmitting}
                  type="submit"
                >
                  Creer la categorie
                </button>
              </form>
              <ul className="record-list">
                {categories.map((category) => (
                  <li className="metric-row" key={category.id}>
                    <span>
                      {category.name}
                      {category.isActive ? "" : " (inactive)"}
                    </span>
                    <button
                      className="secondary-button"
                      disabled={isSubmitting}
                      onClick={() => void handleToggleCategory(category)}
                      type="button"
                    >
                      {category.isActive ? "Desactiver" : "Activer"}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function formatTnd(value: string): string {
  return new Intl.NumberFormat("fr-TN", {
    style: "currency",
    currency: "TND",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(Number(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-TN", {
    dateStyle: "short",
    timeZone: "Africa/Tunis",
  }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Operation impossible.";
}
