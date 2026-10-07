import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { RouterProvider } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import { makeProduct, makeResaleProduct } from "../../test/factories/catalog";
import { makePurchase, makeSupplier } from "../../test/factories/procurement";
import { makeUser } from "../../test/factories/user";
import { apiError, apiV1 } from "../../test/msw/envelope";
import { authHandlers } from "../../test/msw/handlers/auth";
import {
  catalogHandlers,
  makeCatalogStore,
} from "../../test/msw/handlers/catalog";
import {
  makeProcurementStore,
  procurementHandlers,
} from "../../test/msw/handlers/procurement";
import { server } from "../../test/msw/server";
import { mockViewport } from "../../test/viewport";

const buyer = makeUser({
  effectivePermissions: [
    "suppliers.view",
    "suppliers.create",
    "suppliers.update",
    "purchases.view",
    "purchases.create",
    "purchases.post",
    "purchases.cancel",
    "supplier_payments.view",
    "supplier_payments.create",
    "supplier_balances.view",
    "raw_materials.view",
    "inventory.view",
  ],
});

function renderAt(path: string, width = 1280, user = buyer) {
  mockViewport(width);
  server.use(...authHandlers(user));
  const router = createTestRouter([path]);
  render(
    <AppProviders client={createQueryClient({ retry: false })}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return router;
}

/// Requests by API path since the call.
function countRequests() {
  const counts = new Map<string, number>();
  server.events.on("request:start", ({ request }) => {
    const path = new URL(request.url).pathname.replace(/^.*\/api\/v1/, "");
    counts.set(path, (counts.get(path) ?? 0) + 1);
  });
  return { of: (path: string) => counts.get(path) ?? 0 };
}

describe("Procurement", () => {
  beforeAll(async () => {
    await Promise.all([
      import("./pages/SuppliersPage"),
      import("./pages/SupplierDetailPage"),
      import("./pages/PurchasesPage"),
      import("./pages/PurchaseEditorPage"),
      import("./pages/PurchaseDetailPage"),
      import("./pages/SupplierPaymentsPage"),
    ]);
  });

  it("lists suppliers with what is owed and creates one from the dialog", async () => {
    const store = makeProcurementStore();
    server.use(...procurementHandlers(store));
    renderAt("/fournisseurs");

    const table = await screen.findByRole("table", { name: "Fournisseurs" });
    const row = within(table).getByText("Minoterie du Sud").closest("tr");
    expect(row).toHaveTextContent("150,000");
    expect(row).toHaveTextContent("1");
    expect(table.textContent).not.toMatch(/supplier-/);

    await userEvent.click(
      screen.getByRole("button", { name: "Nouveau fournisseur" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Nouveau fournisseur",
    });
    await userEvent.type(
      within(dialog).getByLabelText(/^Nom/),
      "Huilerie Ouest",
    );
    await userEvent.type(
      within(dialog).getByLabelText(/Téléphone/),
      "71 222 333",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enregistrer" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(store.suppliers.at(-1)).toMatchObject({
      name: "Huilerie Ouest",
      phone: "71 222 333",
    });
    expect(
      await within(
        screen.getByRole("table", { name: "Fournisseurs" }),
      ).findByText("Huilerie Ouest"),
    ).toBeInTheDocument();
  });

  // AS-005: a purchase of 4 sacs of flour at 1,250 TND per kg, paid in part,
  // saved as a draft, then posted with the impact stated in base units.
  it("creates a purchase with a converted unit, partial terms and posts it with the impact", async () => {
    const store = makeProcurementStore();
    server.use(...procurementHandlers(store));
    const requests = countRequests();
    renderAt("/achats/nouveau");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Nouvel achat" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("combobox", { name: "Fournisseur" }),
    );
    await userEvent.type(
      screen.getByPlaceholderText("Nom du fournisseur"),
      "minoterie",
    );
    await userEvent.click(await screen.findByText(/Solde dû 150,000/));

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
      "4",
    );
    await userEvent.click(screen.getByRole("combobox", { name: "Unité 1" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "Sac de 50 kg" }),
    );
    // Issue 016: with a unit other than the base one, the quantity says
    // what it amounts to and the price says which unit it is for.
    expect(screen.getByText("= 200 kg")).toBeInTheDocument();
    expect(screen.getByText("par kg")).toBeInTheDocument();
    // Issue 009: the total typed for 4 sacs (200 kg) gives the price per
    // kg, and the picker of a second line reads the session cache.
    await userEvent.clear(
      screen.getByRole("textbox", { name: "Total ligne 1" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Total ligne 1" }),
      "250",
    );
    expect(
      screen.getByRole("textbox", { name: "Prix unitaire 1" }),
    ).toHaveValue("1,250");
    expect(screen.getAllByText("250,000 TND").length).toBeGreaterThan(0);
    const before = requests.of("/catalog/raw-materials");
    await userEvent.click(
      screen.getByRole("button", { name: "Ajouter une ligne" }),
    );
    await userEvent.click(
      screen.getByRole("combobox", { name: "Matière première 2" }),
    );
    // Issue 016: the second line reads the session cache and leaves out
    // the material the first line already holds.
    // The catalogue holds that one material: nothing is left to pick.
    expect(await screen.findByText("Aucun résultat")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Farine T55/ })).toBeNull();
    expect(requests.of("/catalog/raw-materials")).toBe(before);
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      screen.getByRole("button", { name: "Retirer la ligne 2" }),
    );

    await userEvent.click(screen.getByRole("radio", { name: "Partiel" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: /Montant payé/ }),
      "100",
    );
    expect(screen.getByText("150,000 TND")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Valider l'achat" }),
    );
    expect(
      await screen.findByText("Indiquez l'échéance du reste à payer."),
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Échéance/), "2026-10-31");
    await userEvent.click(
      screen.getByRole("button", { name: "Valider l'achat" }),
    );

    const confirm = await screen.findByRole("alertdialog", {
      name: /Valider l'achat/,
    });
    expect(confirm).toHaveTextContent("Stock : +200 kg Farine T55.");
    expect(confirm).toHaveTextContent(
      "Dette fournisseur Minoterie du Sud : +150,000 TND",
    );
    expect(confirm).toHaveTextContent("Paiement enregistré : 100,000 TND.");
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Valider" }),
    );

    expect(await screen.findByText("Achat validé")).toBeInTheDocument();
    const posted = store.purchases[0];
    expect(posted).toMatchObject({
      status: "POSTED",
      paymentTerms: "PARTIAL",
      paidAmountTnd: "100.000",
      totalTnd: "250.000",
    });
    expect(posted?.lines[0]).toMatchObject({
      enteredUnitId: "unit-sac",
      normalizedQuantity: "200.000000",
      lineTotalTnd: "250.000",
    });
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: posted?.reference ?? "",
      }),
    ).toBeInTheDocument();
  });

  it("cancels a posted purchase with a mandatory reason", async () => {
    const store = makeProcurementStore();
    server.use(...procurementHandlers(store));
    renderAt("/achats/purchase-1");

    expect(
      await screen.findByRole("heading", { level: 1, name: "AC-000001" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Annuler AC-000001",
    });
    expect(dialog).toHaveTextContent("−100 kg Farine T55");
    await userEvent.type(
      within(dialog).getByLabelText(/Motif/),
      "Livraison refusée",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Annuler l'achat" }),
    );

    expect(await screen.findByText("Achat annulé")).toBeInTheDocument();
    expect(store.purchases[0]).toMatchObject({
      status: "CANCELLED",
      cancellationReason: "Livraison refusée",
    });
  });

  // AS-V2-16 on a phone: 300,000 TND paid, allocated 200,000 + 100,000 to the
  // two open purchases, nothing left unallocated.
  it("records a supplier payment split across two open purchases on a phone", async () => {
    const supplier = makeSupplier({
      id: "supplier-1",
      name: "Minoterie du Sud",
    });
    const store = makeProcurementStore({
      purchases: [
        makePurchase({
          id: "purchase-1",
          reference: "AC-000001",
          supplier,
          supplierId: supplier.id,
          paymentTerms: "UNPAID",
          paidAmountTnd: "0.000",
          totalTnd: "200.000",
          dueDate: "2026-09-01T08:00:00.000Z",
        }),
        makePurchase({
          id: "purchase-2",
          reference: "AC-000002",
          supplier,
          supplierId: supplier.id,
          paymentTerms: "UNPAID",
          paidAmountTnd: "0.000",
          totalTnd: "100.000",
          dueDate: "2026-12-01T08:00:00.000Z",
        }),
      ],
      payments: [],
    });
    server.use(...procurementHandlers(store));
    renderAt("/fournisseurs/supplier-1", 360);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Minoterie du Sud",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("300,000 TND")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Payer" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Nouveau paiement",
    });
    expect(within(dialog).getByText("Montant dû")).toBeInTheDocument();
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: /Montant/ }),
      "300",
    );
    await userEvent.type(
      await within(dialog).findByRole("textbox", {
        name: "Affectation AC-000001",
      }),
      "200",
    );
    expect(within(dialog).getByText("En retard")).toBeInTheDocument();
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "Affectation AC-000002" }),
      "150",
    );
    expect(
      within(dialog).getByText("Affectations en excès"),
    ).toBeInTheDocument();
    await userEvent.clear(
      within(dialog).getByRole("textbox", { name: "Affectation AC-000002" }),
    );
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "Affectation AC-000002" }),
      "100",
    );
    expect(within(dialog).getByText("Reste à répartir")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Reste à répartir").parentElement,
    ).toHaveTextContent("0,000 TND");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enregistrer le paiement" }),
    );

    expect(await screen.findByText("Paiement enregistré")).toBeInTheDocument();
    expect(store.payments[0]).toMatchObject({
      amountTnd: "300.000",
      allocations: [
        { purchaseId: "purchase-1", amountTnd: "200.000" },
        { purchaseId: "purchase-2", amountTnd: "100.000" },
      ],
    });
    expect(
      await screen.findByText("Rien n'est dû à ce fournisseur."),
    ).toBeInTheDocument();
  });

  // A supplier payment recorded by mistake is reversed, never deleted: the
  // row stays as annulé and the purchase owes its amount again.
  it("reverses a supplier payment from the payments list with a reason", async () => {
    const store = makeProcurementStore();
    server.use(...procurementHandlers(store));
    renderAt("/paiements-fournisseurs");

    const table = await screen.findByRole("table", {
      name: "Paiements fournisseurs",
    });
    expect(within(table).getByText("Réglé")).toBeInTheDocument();
    await userEvent.click(
      within(table).getByRole("button", { name: "Actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Annuler le paiement" }),
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: "Annuler le paiement",
    });
    expect(confirm).toHaveTextContent("Le reste dû de AC-000001 est rétabli.");
    await userEvent.type(
      within(confirm).getByLabelText(/Motif/),
      "Double saisie",
    );
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Annuler le paiement" }),
    );

    expect(await screen.findByText("Paiement annulé")).toBeInTheDocument();
    expect(store.payments[0]).toMatchObject({
      reversalReason: "Double saisie",
    });
    expect(store.payments[0]?.reversedAt).toBeTruthy();
    expect(
      await within(
        screen.getByRole("table", { name: "Paiements fournisseurs" }),
      ).findByText("Annulé"),
    ).toBeInTheDocument();
  });

  it("lists purchases with the overdue badge and the ledger balance", async () => {
    const store = makeProcurementStore({
      purchases: [
        makePurchase({
          id: "purchase-1",
          reference: "AC-000001",
          paymentTerms: "UNPAID",
          paidAmountTnd: "0.000",
          totalTnd: "250.000",
          dueDate: "2026-09-01T08:00:00.000Z",
        }),
      ],
      payments: [],
    });
    server.use(...procurementHandlers(store));
    renderAt("/achats");

    const table = await screen.findByRole("table", { name: "Achats" });
    const row = within(table).getByText("AC-000001").closest("tr");
    expect(row).toHaveTextContent("En retard");
    expect(row).toHaveTextContent("Validé");
    expect(within(row as HTMLElement).getAllByText("250,000 TND").length).toBe(
      2,
    );
    expect(table.textContent).not.toMatch(/purchase-|supplier-/);
  });

  // Issue 016: the form refuses what the server would refuse, on the field
  // concerned, with a summary the user cannot miss.
  // Issue 019, DEC-V2-010: a purchase line buys a raw material or a product
  // flagged for resale; the picker offers both and says which is which.
  describe("resold products on a purchase (issue 019)", () => {
    const buyerOfGoods = makeUser({
      effectivePermissions: [...buyer.effectivePermissions, "products.view"],
    });

    it("buys a resold product and a raw material on one purchase and posts it", async () => {
      const store = makeProcurementStore();
      server.use(
        ...catalogHandlers(
          makeCatalogStore({
            products: [
              makeProduct({ id: "product-1", name: "Pain complet" }),
              makeResaleProduct(),
            ],
          }),
        ),
        ...procurementHandlers(store),
      );
      renderAt("/achats/nouveau", 1280, buyerOfGoods);

      await screen.findByRole("heading", { level: 1, name: "Nouvel achat" });
      await userEvent.click(
        screen.getByRole("combobox", { name: "Fournisseur" }),
      );
      await userEvent.type(
        screen.getByPlaceholderText("Nom du fournisseur"),
        "minoterie",
      );
      await userEvent.click(await screen.findByText(/Solde dû 150,000/));

      await userEvent.click(
        screen.getByRole("combobox", { name: "Article 1" }),
      );
      await userEvent.type(
        screen.getByPlaceholderText("Rechercher article"),
        "eau",
      );
      // The option says what it is; a product made here is not offered.
      expect(
        await screen.findByText("Produit de revente · Pièce · Boissons"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Pain complet")).not.toBeInTheDocument();
      await userEvent.click(screen.getByText("Eau 1,5 L"));
      await userEvent.type(
        screen.getByRole("textbox", { name: "Quantité 1" }),
        "24",
      );
      await userEvent.type(
        screen.getByRole("textbox", { name: "Prix unitaire 1" }),
        "0,85",
      );
      expect(
        screen.getByRole("textbox", { name: "Total ligne 1" }),
      ).toHaveValue("20,400");

      await userEvent.click(
        screen.getByRole("button", { name: "Ajouter une ligne" }),
      );
      await userEvent.click(
        screen.getByRole("combobox", { name: "Article 2" }),
      );
      await userEvent.type(
        screen.getByPlaceholderText("Rechercher article"),
        "farine",
      );
      expect(
        await screen.findByText(/^Matière première · Kilogramme/),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByText("Farine T55"));
      await userEvent.type(
        screen.getByRole("textbox", { name: "Quantité 2" }),
        "10",
      );
      await userEvent.type(
        screen.getByRole("textbox", { name: "Prix unitaire 2" }),
        "1,2",
      );

      await userEvent.click(screen.getByRole("radio", { name: "Payé" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Valider l'achat" }),
      );
      const confirm = await screen.findByRole("alertdialog", {
        name: /Valider l'achat/,
      });
      expect(confirm).toHaveTextContent("Eau 1,5 L");
      expect(confirm).toHaveTextContent("Farine T55");
      await userEvent.click(
        within(confirm).getByRole("button", { name: "Valider" }),
      );

      expect(await screen.findByText("Achat validé")).toBeInTheDocument();
      const posted = store.purchases[0];
      expect(posted).toMatchObject({ status: "POSTED", totalTnd: "32.400" });
      expect(posted?.lines).toEqual([
        expect.objectContaining({
          productId: "product-water",
          rawMaterialId: null,
          // A resold product is bought in its one unit.
          enteredUnitId: "unit-piece",
          normalizedQuantity: "24.000000",
          lineTotalTnd: "20.400",
        }),
        expect.objectContaining({
          productId: null,
          rawMaterialId: "raw-1",
          lineTotalTnd: "12.000",
        }),
      ]);

      // The purchase page says which line is a resold product.
      const lines = await screen.findByRole("table", {
        name: "Lignes de l'achat",
      });
      const waterRow = within(lines)
        .getByText("Eau 1,5 L")
        .closest("tr") as HTMLElement;
      expect(within(waterRow).getByText("Revente")).toBeInTheDocument();
      expect(within(lines).getAllByText("Revente")).toHaveLength(1);
    });

    it("keeps a picker of raw materials for a buyer who cannot list the products", async () => {
      server.use(...procurementHandlers(makeProcurementStore()));
      const requests = countRequests();
      renderAt("/achats/nouveau");

      await screen.findByRole("heading", { level: 1, name: "Nouvel achat" });
      await userEvent.click(
        screen.getByRole("combobox", { name: "Matière première 1" }),
      );
      expect(await screen.findByText("Farine T55")).toBeInTheDocument();
      expect(requests.of("/catalog/products")).toBe(0);
    });

    it("puts a refusal of the server about a product on its line", async () => {
      server.use(
        ...catalogHandlers(
          makeCatalogStore({ products: [makeResaleProduct()] }),
        ),
        ...procurementHandlers(makeProcurementStore()),
      );
      server.use(
        http.post(`${apiV1}/procurement/purchases`, () =>
          apiError(
            400,
            "VALIDATION_ERROR",
            "Les données saisies sont invalides.",
            { "lines.0.productId": "Ce produit n'est plus à la revente." },
          ),
        ),
      );
      renderAt("/achats/nouveau", 1280, buyerOfGoods);

      await screen.findByRole("heading", { level: 1, name: "Nouvel achat" });
      await userEvent.click(
        screen.getByRole("combobox", { name: "Fournisseur" }),
      );
      await userEvent.type(
        screen.getByPlaceholderText("Nom du fournisseur"),
        "minoterie",
      );
      await userEvent.click(await screen.findByText(/Solde dû 150,000/));
      await userEvent.click(
        screen.getByRole("combobox", { name: "Article 1" }),
      );
      await userEvent.click(await screen.findByText("Eau 1,5 L"));
      await userEvent.type(
        screen.getByRole("textbox", { name: "Quantité 1" }),
        "6",
      );
      await userEvent.type(
        screen.getByRole("textbox", { name: "Prix unitaire 1" }),
        "0,85",
      );
      await userEvent.click(screen.getByRole("radio", { name: "Payé" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Enregistrer le brouillon" }),
      );

      expect(
        await screen.findByText("Ce produit n'est plus à la revente."),
      ).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Corrigez le champ signalé.",
      );
    });
  });

  describe("purchase form validation (issue 016)", () => {
    async function pickFlour(line: number) {
      await userEvent.click(
        screen.getByRole("combobox", { name: `Matière première ${line}` }),
      );
      await userEvent.click(await screen.findByText("Farine T55"));
    }

    it("flags every missing field and sums them up", async () => {
      const store = makeProcurementStore();
      server.use(...procurementHandlers(store));
      renderAt("/achats/nouveau");
      await screen.findByRole("heading", { level: 1, name: "Nouvel achat" });
      const before = store.purchases.length;

      await userEvent.click(
        screen.getByRole("button", { name: "Enregistrer le brouillon" }),
      );

      const summary = await screen.findByRole("alert");
      expect(summary).toHaveTextContent("Le formulaire contient des erreurs.");
      // Supplier, material, quantity and unit price; the rules between
      // fields (the due date of an unpaid purchase) come once these hold.
      expect(summary).toHaveTextContent("Corrigez les 4 champs signalés.");
      expect(
        screen.getByText("Choisissez un fournisseur."),
      ).toBeInTheDocument();
      expect(screen.getByText("Choisissez un article.")).toBeInTheDocument();
      expect(screen.getAllByText("Ce champ est obligatoire.")).toHaveLength(2);
      expect(store.purchases).toHaveLength(before);
    });

    it("shows no text under the quantity for the base unit and refuses a zero price", async () => {
      server.use(...procurementHandlers(makeProcurementStore()));
      renderAt("/achats/nouveau");
      await screen.findByRole("heading", { level: 1, name: "Nouvel achat" });

      await pickFlour(1);
      await userEvent.type(
        screen.getByRole("textbox", { name: "Quantité 1" }),
        "10",
      );
      // The client's report: "Prix par kg" appeared under the quantity.
      expect(screen.queryByText(/prix par/i)).toBeNull();
      expect(screen.queryByText("par kg")).toBeNull();

      await userEvent.type(
        screen.getByRole("textbox", { name: "Prix unitaire 1" }),
        "0",
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Enregistrer le brouillon" }),
      );

      expect(
        await screen.findByText("La valeur doit être supérieure à zéro."),
      ).toBeInTheDocument();
    });

    it("refuses a purchase dated in the future and a due date before the purchase", async () => {
      server.use(...procurementHandlers(makeProcurementStore()));
      renderAt("/achats/nouveau");
      await screen.findByRole("heading", { level: 1, name: "Nouvel achat" });

      const date = screen.getByLabelText(/Date d'achat/);
      await userEvent.clear(date);
      await userEvent.type(date, "2099-01-01");
      await userEvent.type(screen.getByLabelText(/Échéance/), "2026-01-01");
      await userEvent.click(
        screen.getByRole("button", { name: "Enregistrer le brouillon" }),
      );

      expect(
        await screen.findByText(
          "La date d'achat ne peut pas être dans le futur.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText("L'échéance ne peut pas précéder la date d'achat."),
      ).toBeInTheDocument();
    });

    it("puts a refusal of the server on the line it concerns", async () => {
      const store = makeProcurementStore();
      server.use(...procurementHandlers(store));
      server.use(
        http.post(`${apiV1}/procurement/purchases`, () =>
          apiError(
            400,
            "VALIDATION_ERROR",
            "Les données saisies sont invalides.",
            {
              "lines.0.rawMaterialId":
                "Cette matière première est déjà sur une autre ligne.",
              "lines.0.enteredQuantity":
                "La quantité doit être supérieure à zéro.",
            },
          ),
        ),
      );
      renderAt("/achats/nouveau");
      await screen.findByRole("heading", { level: 1, name: "Nouvel achat" });
      await userEvent.click(
        screen.getByRole("combobox", { name: "Fournisseur" }),
      );
      await userEvent.click(await screen.findByText(/Solde dû 150,000/));
      await pickFlour(1);
      await userEvent.type(
        screen.getByRole("textbox", { name: "Quantité 1" }),
        "10",
      );
      await userEvent.type(
        screen.getByRole("textbox", { name: "Prix unitaire 1" }),
        "1,2",
      );
      await userEvent.click(screen.getByRole("radio", { name: "Payé" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Enregistrer le brouillon" }),
      );

      // The API names the field `rawMaterialId`; the form shows it under
      // the picker of that line.
      expect(
        await screen.findByText(
          "Cette matière première est déjà sur une autre ligne.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText("La quantité doit être supérieure à zéro."),
      ).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Corrigez les 2 champs signalés.",
      );
    });
  });

  // Issue 016, the client's case: a purchase is cancelled, which takes its
  // payment back; that payment then reads as cancelled and cannot be
  // cancelled a second time.
  describe("a payment of a cancelled purchase (issue 016)", () => {
    it("reads as cancelled, with no action, once its purchase is cancelled", async () => {
      const store = makeProcurementStore();
      server.use(...procurementHandlers(store));
      renderAt("/achats/purchase-1");
      await screen.findByRole("heading", { level: 1, name: "AC-000001" });
      await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
      const dialog = await screen.findByRole("alertdialog", {
        name: "Annuler AC-000001",
      });
      await userEvent.type(
        within(dialog).getByLabelText(/Motif/),
        "Livraison refusée",
      );
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Annuler l'achat" }),
      );
      expect(await screen.findByText("Achat annulé")).toBeInTheDocument();
      expect(store.payments[0]?.reversedAt).toBeTruthy();

      // On the payments page the payment reads as cancelled and offers
      // nothing to cancel.
      cleanup();
      renderAt("/paiements-fournisseurs");
      const table = await screen.findByRole("table", {
        name: "Paiements fournisseurs",
      });
      expect(await within(table).findByText("Annulé")).toBeInTheDocument();
      expect(
        within(table).queryByRole("button", { name: "Actions" }),
      ).toBeNull();
    });

    it("offers no cancellation on a payment whose purchase is cancelled, even an older one", async () => {
      const store = makeProcurementStore();
      // Cancelled before the rule existed: the payment row was left as is.
      Object.assign(store.purchases[0] ?? {}, { status: "CANCELLED" });
      server.use(...procurementHandlers(store));
      renderAt("/paiements-fournisseurs");

      const table = await screen.findByRole("table", {
        name: "Paiements fournisseurs",
      });
      expect(
        await within(table).findByText("Achat annulé"),
      ).toBeInTheDocument();
      expect(
        within(table).queryByRole("button", { name: "Actions" }),
      ).toBeNull();
    });
  });
});
