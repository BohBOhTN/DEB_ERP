import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import { makePosSession } from "../../test/factories/pos";
import { makeUser } from "../../test/factories/user";
import { authHandlers } from "../../test/msw/handlers/auth";
import { makePosStore, posHandlers } from "../../test/msw/handlers/pos";
import { server } from "../../test/msw/server";
import { mockViewport } from "../../test/viewport";
import { useCartStore } from "./cart.store";

const cashier = makeUser({
  effectivePermissions: [
    "pos.access",
    "pos.open_session",
    "pos.sell",
    "pos.credit_sale",
    "pos.close_session",
    "orders.create",
  ],
});

function renderAt(
  path: string,
  width = 1280,
  permissions = cashier.effectivePermissions,
) {
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

async function addProduct(name: string) {
  await userEvent.click(
    await screen.findByRole("button", { name: `Ajouter ${name}` }),
  );
}

describe("Caisse", () => {
  beforeAll(async () => {
    await import("./pos");
  });

  beforeEach(() => {
    useCartStore.getState().clear();
  });

  // AS-V2-18 at 360 px: open the till, three products, one adjusted, paid
  // with change; then a partial credit sale for a registered customer; then
  // the close with a difference shown before confirming.
  it("runs the phone flow: open, sell with change, sell on credit, close with a difference", async () => {
    const store = makePosStore();
    server.use(...posHandlers(store));
    renderAt("/caisse", 360);

    expect(
      await screen.findByText("Aucune session ouverte"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Ouvrir la caisse" }),
    );
    const openDialog = await screen.findByRole("dialog", {
      name: "Ouvrir la caisse",
    });
    await userEvent.type(
      within(openDialog).getByRole("textbox", { name: /Fonds de caisse/ }),
      "50",
    );
    await userEvent.click(
      within(openDialog).getByRole("button", { name: "Ouvrir la caisse" }),
    );
    expect(
      (await screen.findAllByText("Caisse ouverte"))[0],
    ).toBeInTheDocument();
    expect(store.session).not.toBeNull();

    await addProduct("Pain complet");
    await addProduct("Pain complet");
    await addProduct("Croissant");
    await addProduct("Gâteau au kilo");
    // Adjust: one croissant less through the tile stepper... then back.
    await userEvent.click(
      screen.getByRole("button", { name: "Retirer un Croissant" }),
    );
    expect(
      screen.queryByRole("button", { name: "Retirer un Croissant" }),
    ).not.toBeInTheDocument();
    await addProduct("Croissant");
    const bar = screen.getByRole("status", { name: "Panier" });
    expect(bar).toHaveTextContent("21,400 TND");
    expect(bar).toHaveTextContent("4 articles");

    await userEvent.click(
      screen.getByRole("button", { name: "Voir le panier" }),
    );
    const sheet = await screen.findByRole("dialog", {
      name: /Panier · 21,400/,
    });
    await userEvent.type(
      within(sheet).getByRole("textbox", { name: /^Montant/ }),
      "25",
    );
    expect(sheet).toHaveTextContent("Monnaie à rendre");
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Encaisser" }),
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: "Encaisser la vente",
    });
    expect(confirm).toHaveTextContent("Monnaie à rendre : 3,600 TND.");
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Valider" }),
    );
    expect(
      (await screen.findAllByText("Vente enregistrée"))[0],
    ).toBeInTheDocument();
    expect(store.sales[0]).toMatchObject({
      totalTnd: "21.400",
      paidAmountTnd: "21.400",
      remainingDueTnd: "0.000",
      paymentState: "PAID",
    });
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: store.sales[0]?.reference ?? "",
      }),
    ).toBeInTheDocument();

    await userEvent.click(
      await screen.findByRole("button", { name: "Nouvelle vente" }),
    );
    await addProduct("Gâteau au kilo");
    await userEvent.click(
      screen.getByRole("button", { name: "Voir le panier" }),
    );
    const credit = await screen.findByRole("dialog", {
      name: /Panier · 18,000/,
    });
    await userEvent.type(
      within(credit).getByRole("textbox", { name: /^Montant/ }),
      "10",
    );
    expect(
      within(credit).getByRole("button", { name: "Encaisser" }),
    ).toBeDisabled();
    expect(credit).toHaveTextContent(
      "Un client enregistré est obligatoire pour une vente à crédit.",
    );
    await userEvent.click(
      within(credit).getByRole("combobox", { name: "Client" }),
    );
    await userEvent.type(
      screen.getByPlaceholderText("Client de passage"),
      "amel",
    );
    await userEvent.click(await screen.findByText("Amel Trabelsi"));
    expect(credit).toHaveTextContent(
      "8,000 TND seront portés au compte de Amel Trabelsi",
    );
    await userEvent.click(
      within(credit).getByRole("button", { name: "Encaisser" }),
    );
    const confirmCredit = await screen.findByRole("alertdialog", {
      name: "Encaisser la vente",
    });
    expect(confirmCredit).toHaveTextContent(
      "Reste à payer porté au compte client : 8,000 TND.",
    );
    await userEvent.click(
      within(confirmCredit).getByRole("button", { name: "Valider" }),
    );
    expect(
      (await screen.findAllByText("Vente enregistrée"))[0],
    ).toBeInTheDocument();
    expect(store.sales[0]).toMatchObject({
      customerId: "customer-1",
      paidAmountTnd: "10.000",
      remainingDueTnd: "8.000",
      paymentState: "PARTIALLY_PAID",
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Nouvelle vente" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Clôturer" }),
    );
    const closeDialog = await screen.findByRole("alertdialog", {
      name: "Clôturer la caisse",
    });
    expect(
      await within(closeDialog).findByText("81,400 TND"),
    ).toBeInTheDocument();
    await userEvent.type(
      within(closeDialog).getByRole("textbox", { name: /Espèces comptées/ }),
      "80",
    );
    expect(
      within(closeDialog).getByText("Écart").parentElement,
    ).toHaveTextContent("−1,400 TND");
    await userEvent.click(
      within(closeDialog).getByRole("button", { name: "Clôturer" }),
    );
    expect(
      (await screen.findAllByText("Caisse clôturée"))[0],
    ).toBeInTheDocument();
    expect(store.sessions[0]).toMatchObject({
      status: "CLOSED",
      expectedCashTnd: "81.400",
      countedCashTnd: "80.000",
      cashDifferenceTnd: "-1.400",
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: /Session du/ }),
    ).toBeInTheDocument();
  }, 30_000);

  // AS-008: without a customer the till refuses a partial sale in French,
  // and without the credit permission it refuses even with a customer.
  it("refuses anonymous credit and explains why the button is disabled", async () => {
    const store = makePosStore({
      session: makePosSession(),
      sessions: [makePosSession()],
    });
    server.use(...posHandlers(store));
    renderAt("/caisse", 1280, ["pos.access", "pos.sell"]);

    await addProduct("Pain complet");
    const pay = screen.getByRole("textbox", { name: /^Montant/ });
    await userEvent.type(pay, "1");
    expect(screen.getByRole("button", { name: "Encaisser" })).toBeDisabled();
    expect(
      screen.getByText(
        "Un client enregistré est obligatoire pour une vente à crédit.",
      ),
    ).toBeInTheDocument();
    await userEvent.clear(pay);
    expect(screen.getByRole("button", { name: "Encaisser" })).toBeEnabled();
    expect(store.sales).toHaveLength(0);
  });

  // AS-019 and AS-V2-19: the response is lost after the server committed;
  // the retry reuses the cart's key and the receipt shows the original sale.
  it("retries a lost response with the same idempotency key and posts one sale", async () => {
    const store = makePosStore({
      session: makePosSession(),
      sessions: [makePosSession()],
      dropNextSaleResponse: true,
    });
    server.use(...posHandlers(store));
    renderAt("/caisse", 1280);

    await addProduct("Croissant");
    await userEvent.click(screen.getByRole("button", { name: "Encaisser" }));
    const confirm = await screen.findByRole("alertdialog", {
      name: "Encaisser la vente",
    });
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Valider" }),
    );
    expect(await within(confirm).findByRole("alert")).toBeInTheDocument();
    expect(store.sales).toHaveLength(1);
    expect(store.saleKeys.size).toBe(1);

    await userEvent.click(
      within(confirm).getByRole("button", { name: /Réessayer|Valider/ }),
    );
    expect(
      (await screen.findAllByText("Vente enregistrée"))[0],
    ).toBeInTheDocument();
    expect(store.sales).toHaveLength(1);
    expect(store.saleKeys.size).toBe(1);
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: store.sales[0]?.reference ?? "",
      }),
    ).toBeInTheDocument();
  });

  it("lists sales and sessions without identifiers", async () => {
    const session = makePosSession({
      status: "CLOSED",
      closedAt: "2026-09-23T18:00:00.000Z",
      expectedCashTnd: "81.400",
      countedCashTnd: "80.000",
      cashDifferenceTnd: "-1.400",
    });
    const store = makePosStore({ sessions: [session] });
    server.use(...posHandlers(store));
    renderAt("/caisse/sessions");

    const table = await screen.findByRole("table", {
      name: "Sessions de caisse",
    });
    expect(within(table).getByText("Salma Ben Ali")).toBeInTheDocument();
    expect(within(table).getByText("-1,400 TND")).toBeInTheDocument();
    expect(table.textContent).not.toMatch(/session-|user-/);
    await waitFor(() =>
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument(),
    );
  });
});
