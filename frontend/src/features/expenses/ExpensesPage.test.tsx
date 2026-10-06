import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import { makeUser } from "../../test/factories/user";
import { authHandlers } from "../../test/msw/handlers/auth";
import { makeExpense } from "../../test/factories/expenses";
import {
  expensesHandlers,
  makeExpensesStore,
} from "../../test/msw/handlers/expenses";
import { server } from "../../test/msw/server";
import { mockViewport } from "../../test/viewport";

const manager = makeUser({
  effectivePermissions: [
    "expenses.view",
    "expenses.create",
    "expenses.cancel",
    "expense_categories.manage",
  ],
});

function renderAt(path: string, width = 1280) {
  mockViewport(width);
  server.use(...authHandlers(manager));
  const router = createTestRouter([path]);
  render(
    <AppProviders client={createQueryClient({ retry: false })}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}

describe("Expenses", () => {
  beforeAll(async () => {
    await Promise.all([
      import("./pages/ExpensesPage"),
      import("./pages/ExpenseCategoriesPage"),
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // AS-017 and AS-V2-21: cancelling a posted expense needs a reason, keeps
  // it in history as "Annulée" and removes it from the month's totals.
  it("shows the month report and cancels a posted expense with a reason, updating the totals", async () => {
    const store = makeExpensesStore();
    server.use(...expensesHandlers(store));
    renderAt("/depenses?period=custom&from=2026-09-01&to=2026-09-30");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Dépenses" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText("Total dépenses").parentElement?.parentElement,
      ).toHaveTextContent("920,000 TND"),
    );
    expect(screen.getByText("2 dépenses validées")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Dépenses" });
    expect(within(table).getByText("Facture STEG")).toBeInTheDocument();
    expect(within(table).getAllByText("Validée")).toHaveLength(2);
    expect(within(table).getByText("Brouillon")).toBeInTheDocument();
    expect(table.textContent).not.toMatch(/expense-|xcat-/);

    const row = within(table)
      .getByText("Facture STEG")
      .closest("tr") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: "Actions" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Annuler" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Annuler DEP-000001",
    });
    expect(dialog).toHaveTextContent(
      "La dépense de 120,000 TND sera exclue des totaux et restera visible dans l'historique.",
    );
    await userEvent.type(
      within(dialog).getByLabelText(/Motif/),
      "Facture en double",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Annuler la dépense" }),
    );

    expect(
      (await screen.findAllByText("Dépense annulée"))[0],
    ).toBeInTheDocument();
    expect(
      store.expenses.find((expense) => expense.id === "expense-1"),
    ).toMatchObject({
      status: "CANCELLED",
      cancellationReason: "Facture en double",
    });
    await waitFor(() =>
      expect(
        screen.getByText("Total dépenses").parentElement?.parentElement,
      ).toHaveTextContent("800,000 TND"),
    );
    expect(screen.getByText("1 dépense validée")).toBeInTheDocument();
    const cancelledRow = within(screen.getByRole("table", { name: "Dépenses" }))
      .getByText("Facture STEG")
      .closest("tr");
    expect(cancelledRow).toHaveTextContent("Annulée");
  });

  // Issue #41: one period control on every list. "Ce mois" is the report's
  // default; "Hier" empties it; a custom range narrows it to the days typed.
  it("drives the report and the list from the shared period control", async () => {
    // Pinned in September 2026, the month of the fixtures, so "Ce mois"
    // holds them whatever the month the suite runs in.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-23T10:00:00.000Z"));
    const store = makeExpensesStore();
    server.use(...expensesHandlers(store));
    renderAt("/depenses");

    const table = await screen.findByRole("table", { name: "Dépenses" });
    expect(within(table).getByText("DEP-000001")).toBeInTheDocument();
    expect(within(table).getByText("DEP-000002")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Ce mois" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await userEvent.click(screen.getByRole("radio", { name: "Hier" }));
    expect(await screen.findByText("Aucune dépense")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText("Total dépenses").parentElement?.parentElement,
      ).toHaveTextContent("0,000 TND"),
    );

    await userEvent.click(screen.getByRole("radio", { name: "Personnalisée" }));
    const from = screen.getByLabelText("Du");
    const to = screen.getByLabelText("Au");
    await userEvent.clear(from);
    await userEvent.type(from, "2026-09-01");
    await userEvent.clear(to);
    await userEvent.type(to, "2026-09-05");
    expect(
      await screen.findByText("Du 01/09/2026 au 05/09/2026"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(screen.getByRole("table", { name: "Dépenses" })).queryByText(
          "DEP-000001",
        ),
      ).toBeNull(),
    );
    expect(
      within(screen.getByRole("table", { name: "Dépenses" })).getByText(
        "DEP-000002",
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText("Total dépenses").parentElement?.parentElement,
      ).toHaveTextContent("800,000 TND"),
    );
  });

  it("records an expense posted at once from the dialog and posts a draft from the row", async () => {
    const store = makeExpensesStore();
    server.use(...expensesHandlers(store));
    renderAt("/depenses?period=custom&from=2026-09-01&to=2026-09-30", 360);

    await userEvent.click(
      await screen.findByRole("button", { name: "Nouvelle dépense" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Nouvelle dépense",
    });
    await userEvent.click(
      within(dialog).getByRole("combobox", { name: "Catégorie" }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "Loyer" }));
    await userEvent.type(
      within(dialog).getByLabelText(/Libellé/),
      "Loyer octobre",
    );
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: /^Montant/ }),
      "800",
    );
    await userEvent.click(
      within(dialog).getByRole("switch", { name: /Valider immédiatement/ }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enregistrer la dépense" }),
    );

    expect(
      (await screen.findAllByText("Dépense validée"))[0],
    ).toBeInTheDocument();
    expect(store.expenses[0]).toMatchObject({
      description: "Loyer octobre",
      amountTnd: "800.000",
      status: "POSTED",
    });
  });

  // Issue 018: a sub-category sits under its parent, the picker says where
  // a category sits, and a parent cannot go under its own sub-category.
  it("shows the category tree and creates a sub-category under a parent", async () => {
    const store = makeExpensesStore();
    server.use(...expensesHandlers(store));
    renderAt("/depenses/categories");

    const table = await screen.findByRole("table", {
      name: "Catégories de dépenses",
    });
    const names = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[0]?.textContent?.trim());
    expect(names).toEqual(["Électricité", "Loyer", "Fournitures", "Emballage"]);
    expect(
      within(table).getByText("Emballage").closest("[data-depth]"),
    ).toHaveAttribute("data-depth", "1");

    await userEvent.click(
      screen.getByRole("button", { name: "Nouvelle catégorie" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Nouvelle catégorie de dépense",
    });
    await userEvent.type(within(dialog).getByLabelText(/^Nom/), "Serviettes");
    await userEvent.click(
      within(dialog).getByRole("combobox", { name: "Catégorie parente" }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Fournitures › Emballage" }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enregistrer" }),
    );
    await waitFor(() =>
      expect(store.categories.at(-1)).toMatchObject({
        name: "Serviettes",
        parentId: "xcat-4",
      }),
    );
    expect(
      await within(
        screen.getByRole("table", { name: "Catégories de dépenses" }),
      ).findByText("Serviettes"),
    ).toBeInTheDocument();

    // Editing the parent offers neither itself nor its sub-categories.
    const parentRow = within(table)
      .getByText("Fournitures")
      .closest("tr") as HTMLElement;
    await userEvent.click(
      within(parentRow).getByRole("button", { name: "Actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Modifier" }),
    );
    const edit = await screen.findByRole("dialog", {
      name: "Modifier Fournitures",
    });
    await userEvent.click(
      within(edit).getByRole("combobox", { name: "Catégorie parente" }),
    );
    const listbox = await screen.findByRole("listbox");
    expect(
      within(listbox).getByRole("option", { name: "Électricité" }),
    ).toBeInTheDocument();
    expect(
      within(listbox).queryByRole("option", { name: "Fournitures" }),
    ).toBeNull();
    expect(
      within(listbox).queryByRole("option", { name: /Emballage/ }),
    ).toBeNull();
  });

  it("refuses to deactivate a parent whose sub-category is active", async () => {
    const store = makeExpensesStore();
    server.use(...expensesHandlers(store));
    renderAt("/depenses/categories");

    const table = await screen.findByRole("table", {
      name: "Catégories de dépenses",
    });
    const row = within(table)
      .getByText("Fournitures")
      .closest("tr") as HTMLElement;
    await userEvent.click(within(row).getByRole("button", { name: "Actions" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Désactiver" }),
    );
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Désactiver",
      }),
    );
    expect(
      await screen.findByText(/Désactivez d'abord ses sous-catégories/),
    ).toBeInTheDocument();
    expect(store.categories.find((row) => row.id === "xcat-3")).toMatchObject({
      isActive: true,
    });
  });

  // Issue 018: an expense of a trip names its store and links its purchase;
  // the list can be narrowed to one trip from the purchase page.
  it("shows the store of a trip expense and filters the list by its purchase", async () => {
    const store = makeExpensesStore();
    store.expenses.unshift(
      makeExpense({
        id: "expense-9",
        reference: "DEP-000009",
        category: store.categories[3],
        categoryId: "xcat-4",
        amountTnd: "12.500",
        description: "Sachets plastiques",
        expenseDate: "2026-09-12T09:00:00.000Z",
        supplierId: "supplier-1",
        purchaseId: "purchase-7",
        supplier: { id: "supplier-1", name: "Minoterie du Sud" },
        purchase: { id: "purchase-7", reference: "AC-000007" },
      }),
    );
    server.use(...expensesHandlers(store));
    renderAt(
      "/depenses?period=custom&from=2026-09-01&to=2026-09-30&purchaseId=purchase-7",
    );

    const table = await screen.findByRole("table", { name: "Dépenses" });
    const row = within(table)
      .getByText("Sachets plastiques")
      .closest("tr") as HTMLElement;
    expect(row).toHaveTextContent("Minoterie du Sud");
    expect(
      within(row).getByRole("link", { name: "AC-000007" }),
    ).toHaveAttribute("href", "/achats/purchase-7");
    expect(within(table).queryByText("Facture STEG")).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: /Retirer le filtre sur la course/ }),
    );
    expect(
      await within(screen.getByRole("table", { name: "Dépenses" })).findByText(
        "Facture STEG",
      ),
    ).toBeInTheDocument();
  });

  it("lists categories with their expense count and deactivates one", async () => {
    const store = makeExpensesStore();
    server.use(...expensesHandlers(store));
    renderAt("/depenses/categories");

    const table = await screen.findByRole("table", {
      name: "Catégories de dépenses",
    });
    const row = within(table)
      .getByText("Électricité")
      .closest("tr") as HTMLElement;
    expect(row).toHaveTextContent("2");
    await userEvent.click(within(row).getByRole("button", { name: "Actions" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Désactiver" }),
    );
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Désactiver",
      }),
    );
    await waitFor(() =>
      expect(store.categories[0]).toMatchObject({ isActive: false }),
    );
  });
});
