import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import { makeUser } from "../../test/factories/user";
import { authHandlers } from "../../test/msw/handlers/auth";
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
