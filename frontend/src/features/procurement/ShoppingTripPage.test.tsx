import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { RouterProvider } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import { makeUser } from "../../test/factories/user";
import { apiError, apiV1 } from "../../test/msw/envelope";
import { authHandlers } from "../../test/msw/handlers/auth";
import {
  expensesHandlers,
  makeExpensesStore,
} from "../../test/msw/handlers/expenses";
import {
  makeProcurementStore,
  procurementHandlers,
} from "../../test/msw/handlers/procurement";
import { server } from "../../test/msw/server";
import { mockViewport } from "../../test/viewport";

/// Issue 018, DEC-V2-009: one page where the raw materials and the other
/// goods bought at the same store are validated together.
const tripPermissions = [
  "purchases.view",
  "purchases.create",
  "purchases.post",
  "expenses.view",
  "expenses.create",
  "raw_materials.view",
];

function renderAt(path: string, permissions = tripPermissions, width = 1280) {
  mockViewport(width);
  server.use(...authHandlers(makeUser({ effectivePermissions: permissions })));
  const router = createTestRouter([path]);
  render(
    <AppProviders client={createQueryClient({ retry: false })}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}

function mockStores() {
  const expenses = makeExpensesStore();
  const procurement = makeProcurementStore();
  server.use(
    ...expensesHandlers(expenses),
    ...procurementHandlers(procurement, expenses),
  );
  return { expenses, procurement };
}

function countRequests() {
  const counts = new Map<string, number>();
  server.events.on("request:start", ({ request }) => {
    const path = new URL(request.url).pathname.replace(/^.*\/api\/v1/, "");
    counts.set(path, (counts.get(path) ?? 0) + 1);
  });
  return { of: (path: string) => counts.get(path) ?? 0 };
}

async function pickSupplier() {
  await userEvent.click(screen.getByRole("combobox", { name: "Fournisseur" }));
  await userEvent.type(
    screen.getByPlaceholderText("Nom du fournisseur"),
    "minoterie",
  );
  await userEvent.click(await screen.findByText(/Solde dû 150,000/));
}

async function fillFlour() {
  await userEvent.click(
    screen.getByRole("combobox", { name: "Matière première 1" }),
  );
  await userEvent.type(
    screen.getByPlaceholderText("Rechercher matière première"),
    "farine",
  );
  await userEvent.click(await screen.findByText("Farine T55"));
  await userEvent.type(
    screen.getByRole("textbox", { name: "Quantité 1" }),
    "10",
  );
  await userEvent.type(
    screen.getByRole("textbox", { name: "Prix unitaire 1" }),
    "1,2",
  );
}

async function fillBags() {
  await userEvent.click(screen.getByRole("combobox", { name: "Catégorie 1" }));
  await userEvent.click(
    await screen.findByRole("option", { name: "Fournitures › Emballage" }),
  );
  await userEvent.type(
    screen.getByRole("textbox", { name: "Libellé 1" }),
    "Sachets plastiques",
  );
  await userEvent.type(
    screen.getByRole("textbox", { name: "Montant 1" }),
    "12,5",
  );
}

describe("Shopping trip", () => {
  beforeAll(async () => {
    await Promise.all([
      import("./pages/ShoppingTripPage"),
      import("./pages/PurchaseDetailPage"),
      import("../expenses/pages/ExpensesPage"),
    ]);
  });

  it("records flour and plastic bags bought at the same store in one validation", async () => {
    const { expenses, procurement } = mockStores();
    renderAt("/achats/course");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Nouvelle course" }),
    ).toBeInTheDocument();
    await pickSupplier();
    await fillFlour();
    await fillBags();

    const totals = screen.getByRole("complementary", { name: "Totaux" });
    expect(totals).toHaveTextContent("Matières premières12,000 TND");
    expect(totals).toHaveTextContent("Autres achats12,500 TND");
    expect(totals).toHaveTextContent("Total de la course24,500 TND");
    // Paid on the spot by default: the whole trip leaves the till today.
    expect(totals).toHaveTextContent("Sortie de caisse aujourd'hui24,500 TND");

    await userEvent.click(
      screen.getByRole("button", { name: "Valider la course" }),
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: "Valider la course chez Minoterie du Sud",
    });
    expect(confirm).toHaveTextContent("Stock : +10 kg Farine T55.");
    expect(confirm).toHaveTextContent(
      "Dette fournisseur Minoterie du Sud : aucune.",
    );
    expect(confirm).toHaveTextContent(
      "Paiement enregistré sur l'achat : 12,000 TND.",
    );
    expect(confirm).toHaveTextContent(
      "1 dépense pour 12,500 TND, réglée sur place : Sachets plastiques (Fournitures › Emballage).",
    );
    expect(confirm).toHaveTextContent(
      "Sortie de caisse aujourd'hui : 24,500 TND.",
    );
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Valider" }),
    );

    expect(await screen.findByText("Course validée")).toBeInTheDocument();
    const posted = procurement.purchases[0];
    expect(posted).toMatchObject({
      status: "POSTED",
      paymentTerms: "PAID",
      totalTnd: "12.000",
      paidAmountTnd: "12.000",
    });
    expect(expenses.expenses[0]).toMatchObject({
      status: "POSTED",
      description: "Sachets plastiques",
      amountTnd: "12.500",
      categoryId: "xcat-4",
      supplierId: "supplier-1",
      purchaseId: posted?.id,
    });

    // The purchase page shows the other goods of the trip.
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: posted?.reference ?? "",
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", {
        name: "Autres achats de cette course",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sachets plastiques")).toBeInTheDocument();
    expect(screen.getByText("Total des autres achats")).toBeInTheDocument();
  });

  it("records the expenses alone when nothing entered stock, on a phone", async () => {
    const { expenses, procurement } = mockStores();
    const router = renderAt("/achats/course", tripPermissions, 360);

    await screen.findByRole("heading", { level: 1, name: "Nouvelle course" });
    await pickSupplier();
    await userEvent.click(
      screen.getByRole("button", { name: "Retirer la ligne 1" }),
    );
    await fillBags();
    // Nothing to pay the supplier for: the terms card is gone.
    expect(
      screen.queryByText("Paiement des matières premières"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Valider la course" }),
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: /Valider la course/,
    });
    expect(confirm).toHaveTextContent(
      "Aucune matière première : ni stock ni dette fournisseur.",
    );
    expect(confirm).toHaveTextContent("1 dépense pour 12,500 TND");
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Valider" }),
    );

    expect(await screen.findByText("Course validée")).toBeInTheDocument();
    expect(
      screen.getByText("1 dépense · Minoterie du Sud"),
    ).toBeInTheDocument();
    // Only the fixture's purchase remains: the trip created none.
    expect(procurement.purchases.map((row) => row.id)).toEqual(["purchase-1"]);
    expect(expenses.expenses[0]).toMatchObject({
      description: "Sachets plastiques",
      supplierId: "supplier-1",
      purchaseId: null,
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/depenses"),
    );
  });

  it("refuses an empty trip before any request and sums up the mistakes", async () => {
    mockStores();
    const requests = countRequests();
    renderAt("/achats/course");

    await screen.findByRole("heading", { level: 1, name: "Nouvelle course" });
    await userEvent.click(
      screen.getByRole("button", { name: "Retirer la ligne 1" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Retirer la dépense 1" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Valider la course" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le formulaire contient des erreurs.",
    );
    expect(
      screen.getByText("Ajoutez au moins une matière première ou une dépense."),
    ).toBeInTheDocument();
    expect(screen.getByText("Choisissez un fournisseur.")).toBeInTheDocument();
    expect(requests.of("/procurement/shopping-trips")).toBe(0);

    // A line with nothing on it is refused field by field.
    await userEvent.click(
      screen.getByRole("button", { name: "Ajouter une dépense" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Valider la course" }),
    );
    expect(
      await screen.findByText("Choisissez une catégorie."),
    ).toBeInTheDocument();
    expect(screen.getByText("Indiquez le libellé.")).toBeInTheDocument();
    expect(
      screen.getByText("Le montant doit être supérieur à zéro."),
    ).toBeInTheDocument();
    expect(requests.of("/procurement/shopping-trips")).toBe(0);
  });

  it("puts a refusal of the server on the lines it concerns", async () => {
    mockStores();
    server.use(
      http.post(`${apiV1}/procurement/shopping-trips`, () =>
        apiError(
          400,
          "VALIDATION_ERROR",
          "Les données saisies sont invalides.",
          {
            "purchase.lines.0.rawMaterialId":
              "Cette matière première n'est plus active.",
            "expenses.0.categoryId":
              "Une catégorie de dépense active est obligatoire.",
          },
        ),
      ),
    );
    renderAt("/achats/course");

    await screen.findByRole("heading", { level: 1, name: "Nouvelle course" });
    await pickSupplier();
    await fillFlour();
    await fillBags();
    await userEvent.click(
      screen.getByRole("button", { name: "Valider la course" }),
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: /Valider la course/,
    });
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Valider" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Corrigez les 2 champs signalés.",
    );
    expect(
      screen.getByText("Cette matière première n'est plus active."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Une catégorie de dépense active est obligatoire."),
    ).toBeInTheDocument();
  });

  it("asks for the three permissions", async () => {
    mockStores();
    renderAt(
      "/achats/course",
      tripPermissions.filter((key) => key !== "expenses.create"),
    );

    expect(
      await screen.findByText("Autorisation insuffisante"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Valider la course" }),
    ).toBeNull();
  });
});
