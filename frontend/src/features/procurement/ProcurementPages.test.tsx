import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import { makePurchase, makeSupplier } from "../../test/factories/procurement";
import { makeUser } from "../../test/factories/user";
import { authHandlers } from "../../test/msw/handlers/auth";
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

function renderAt(path: string, width = 1280) {
  mockViewport(width);
  server.use(...authHandlers(buyer));
  const router = createTestRouter([path]);
  render(
    <AppProviders client={createQueryClient({ retry: false })}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return router;
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
    expect(screen.getByText(/= 200 kg · prix par kg/)).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole("textbox", { name: "Prix unitaire 1" }),
      "1,25",
    );
    expect(screen.getAllByText("250,000 TND").length).toBeGreaterThan(0);

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
});
