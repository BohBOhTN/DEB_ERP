import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import {
  makeDispatch,
  makeDispatchLine,
  makeDistributor,
  makeSettlement,
} from "../../test/factories/distribution";
import { makeUser } from "../../test/factories/user";
import { authHandlers } from "../../test/msw/handlers/auth";
import {
  distributionHandlers,
  makeDistributionStore,
} from "../../test/msw/handlers/distribution";
import { server } from "../../test/msw/server";
import { mockViewport } from "../../test/viewport";

const manager = makeUser({
  effectivePermissions: [
    "distributors.view",
    "distributors.create",
    "distributors.update",
    "distribution.custody.view",
    "distribution.dispatch",
    "distribution.settle",
    "distribution.direct_sale",
    "distribution.balances.view",
    "distributor_payments.view",
    "distributor_payments.create",
    "pos.access",
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

describe("Distribution", () => {
  beforeAll(async () => {
    await Promise.all([
      import("./pages/DistributorsPage"),
      import("./pages/DistributorDetailPage"),
      import("./pages/CustodyPage"),
      import("./pages/DispatchEditorPage"),
      import("./pages/DispatchDetailPage"),
      import("./pages/SettlementPage"),
      import("./pages/DistributorPaymentsPage"),
    ]);
  });

  // AS-014: dispatching moves stock to custody and creates no sale, debt or
  // payment; the confirmation says so before posting.
  it("dispatches products to a distributor with the impact stated", async () => {
    const store = makeDistributionStore({ dispatches: [] });
    server.use(...distributionHandlers(store));
    renderAt("/distribution/sorties/nouvelle");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Nouvelle sortie" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("combobox", { name: "Distributeur" }),
    );
    await userEvent.type(
      screen.getByPlaceholderText("Nom du distributeur"),
      "karim",
    );
    await userEvent.click(await screen.findByText("Karim Distribution"));
    await userEvent.click(screen.getByRole("combobox", { name: "Produit 1" }));
    await userEvent.type(
      screen.getByPlaceholderText("Rechercher produit"),
      "pain",
    );
    await userEvent.click(await screen.findByText("Pain complet"));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Quantité 1" }),
      "100",
    );
    expect(
      screen.queryByRole("textbox", { name: "Prix unitaire 1" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Enregistrer la sortie" }),
    );

    const confirm = await screen.findByRole("alertdialog", {
      name: "Confirmer la sortie",
    });
    expect(confirm).toHaveTextContent("Stock principal : −100 Pain complet.");
    expect(confirm).toHaveTextContent(
      "Dépôt Karim Distribution : +100 Pain complet.",
    );
    expect(confirm).toHaveTextContent("Aucune vente ni dette");
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Valider" }),
    );

    expect(
      (await screen.findAllByText("Sortie enregistrée"))[0],
    ).toBeInTheDocument();
    expect(store.dispatches[0]).toMatchObject({
      status: "OPEN",
      distributorId: "distributor-1",
    });
    expect(store.dispatches[0]?.lines[0]).toMatchObject({
      dispatchedQuantity: "100.000000",
      stillHeldQuantity: "100.000000",
    });
    expect(store.sales).toHaveLength(0);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: store.dispatches[0]?.reference ?? "",
      }),
    ).toBeInTheDocument();
  });

  // AS-015 and AS-V2-20 on a tablet: 40 dispatched settled as 30 sold, 8
  // returned, 2 unaccounted; blocked until the lines reconcile; afterwards
  // custody shows nothing held, the receivable is 30 × price, and the
  // discrepancy of 2 is visible without a debt entry.
  it("settles a dispatch only once every line reconciles and flags the unaccounted quantity without debt", async () => {
    const karim = makeDistributor({
      id: "distributor-1",
      name: "Karim Distribution",
    });
    const store = makeDistributionStore({
      distributors: [karim],
      dispatches: [
        makeDispatch({
          id: "dispatch-1",
          reference: "BL-000001",
          distributor: karim,
          distributorId: karim.id,
          lines: [
            makeDispatchLine({
              dispatchId: "dispatch-1",
              dispatchedQuantity: "40.000000",
              stillHeldQuantity: "40.000000",
            }),
          ],
        }),
      ],
    });
    server.use(...distributionHandlers(store));
    renderAt("/distribution/sorties/dispatch-1/regler", 768);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Régler BL-000001",
      }),
    ).toBeInTheDocument();
    const line = await screen.findByRole("group", { name: "Pain complet" });
    expect(line).toHaveTextContent("Reste 40 à classer");
    expect(
      screen.getByRole("button", { name: "Régler la sortie" }),
    ).toBeDisabled();
    expect(
      within(line).getByRole("textbox", { name: "Prix unitaire Pain complet" }),
    ).toHaveValue("1,200");

    await userEvent.type(
      within(line).getByRole("textbox", { name: "Vendue Pain complet" }),
      "30",
    );
    await userEvent.type(
      within(line).getByRole("textbox", { name: "Retournée Pain complet" }),
      "8",
    );
    expect(line).toHaveTextContent("Reste 2 à classer");
    expect(
      screen.getByRole("button", { name: "Régler la sortie" }),
    ).toBeDisabled();
    await userEvent.type(
      within(line).getByRole("textbox", { name: "Non justifiée Pain complet" }),
      "3",
    );
    expect(line).toHaveTextContent("Dépassement de 1");
    await userEvent.clear(
      within(line).getByRole("textbox", { name: "Non justifiée Pain complet" }),
    );
    await userEvent.type(
      within(line).getByRole("textbox", { name: "Non justifiée Pain complet" }),
      "2",
    );
    expect(line).toHaveTextContent("Équation vérifiée");
    expect(line).toHaveTextContent("Revenu 36,000 TND");
    expect(
      screen.getByRole("button", { name: "Régler la sortie" }),
    ).toBeEnabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Régler la sortie" }),
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: "Régler BL-000001",
    });
    expect(confirm).toHaveTextContent(
      "Retour en stock principal : +8 Pain complet.",
    );
    expect(confirm).toHaveTextContent(
      "Chiffre d'affaires reconnu : 36,000 TND",
    );
    expect(confirm).toHaveTextContent(
      "créance sur Karim Distribution : 36,000 TND",
    );
    expect(confirm).toHaveTextContent(
      "Non justifié : 2 Pain complet, signalé comme écart sans créer de dette.",
    );
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Valider" }),
    );

    expect(
      (await screen.findAllByText("Sortie réglée"))[0],
    ).toBeInTheDocument();
    expect(store.settlements[0]).toMatchObject({
      totalTnd: "36.000",
      remainingDueTnd: "36.000",
      paymentState: "UNPAID",
    });
    expect(store.dispatches[0]).toMatchObject({ status: "CLOSED" });
    expect(store.dispatches[0]?.lines[0]).toMatchObject({
      settledSoldQuantity: "30.000000",
      returnedQuantity: "8.000000",
      unaccountedQuantity: "2.000000",
      stillHeldQuantity: "0.000000",
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: "BL-000001" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Réglée")).toBeInTheDocument();
  }, 20_000);

  it("shows the custody board with the discrepancy badge and no debt for it", async () => {
    const karim = makeDistributor({
      id: "distributor-1",
      name: "Karim Distribution",
    });
    const store = makeDistributionStore({
      distributors: [karim],
      dispatches: [
        makeDispatch({
          id: "dispatch-1",
          reference: "BL-000001",
          distributor: karim,
          distributorId: karim.id,
          lines: [
            makeDispatchLine({
              dispatchId: "dispatch-1",
              dispatchedQuantity: "40.000000",
              settledSoldQuantity: "30.000000",
              returnedQuantity: "8.000000",
              unaccountedQuantity: "2.000000",
              stillHeldQuantity: "0.000000",
            }),
          ],
        }),
      ],
      settlements: [
        makeSettlement({
          id: "settlement-1",
          dispatchId: "dispatch-1",
          totalTnd: "36.000",
          remainingDueTnd: "36.000",
        }),
      ],
    });
    server.use(...distributionHandlers(store));
    renderAt("/distribution/depot-vente", 360);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Dépôt-vente" }),
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByText("2 non justifiées"))[0],
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Totaux du dépôt" }),
    ).toHaveTextContent("0");
    const table = screen.getByRole("table", {
      name: "Dépôt de Karim Distribution",
    });
    expect(table.textContent).not.toMatch(/dispatch-|distributor-/);

    await userEvent.click(screen.getByRole("tab", { name: "Sorties" }));
    expect(await screen.findByText("BL-000001")).toBeInTheDocument();
  });

  // AS-016: a payment reduces the receivable, touches no custody and
  // recognises no revenue.
  it("records a distributor payment allocated to the settlement", async () => {
    const karim = makeDistributor({
      id: "distributor-1",
      name: "Karim Distribution",
    });
    const store = makeDistributionStore({
      distributors: [karim],
      dispatches: [],
      settlements: [
        makeSettlement({
          id: "settlement-1",
          reference: "RG-000001",
          distributorId: karim.id,
          totalTnd: "36.000",
          remainingDueTnd: "36.000",
        }),
      ],
    });
    server.use(...distributionHandlers(store));
    renderAt("/distributeurs/distributor-1");

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Karim Distribution",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Solde dû").parentElement).toHaveTextContent(
      "36,000 TND",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Nouveau paiement" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Nouveau paiement",
    });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: /^Montant/ }),
      "20",
    );
    await userEvent.type(
      await within(dialog).findByRole("textbox", {
        name: "Affectation RG-000001",
      }),
      "20",
    );
    expect(
      within(dialog).getByText("Reste non alloué").parentElement,
    ).toHaveTextContent("0,000 TND");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enregistrer le paiement" }),
    );

    expect(
      (await screen.findAllByText("Paiement enregistré"))[0],
    ).toBeInTheDocument();
    expect(store.payments[0]).toMatchObject({
      amountTnd: "20.000",
      allocations: [{ settlementId: "settlement-1", amountTnd: "20.000" }],
    });
    await waitFor(() =>
      expect(screen.getByText("Solde dû").parentElement).toHaveTextContent(
        "16,000 TND",
      ),
    );
  });

  it("lists distributors with custody and balance and creates one", async () => {
    const store = makeDistributionStore();
    server.use(...distributionHandlers(store));
    renderAt("/distributeurs");

    const table = await screen.findByRole("table", { name: "Distributeurs" });
    const row = within(table).getByText("Karim Distribution").closest("tr");
    expect(row).toHaveTextContent("1 ligne");
    expect(table.textContent).not.toMatch(/distributor-/);
    await userEvent.click(
      screen.getByRole("button", { name: "Nouveau distributeur" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Nouveau distributeur",
    });
    await userEvent.type(
      within(dialog).getByLabelText(/^Nom/),
      "Nour Livraison",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enregistrer" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(store.distributors.at(-1)).toMatchObject({ name: "Nour Livraison" });
  });
});
