import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import {
  makeCustomer,
  makeOrder,
  makeSale,
} from "../../test/factories/customers";
import { makeUser } from "../../test/factories/user";
import { authHandlers } from "../../test/msw/handlers/auth";
import {
  customersOrdersHandlers,
  makeCustomersOrdersStore,
} from "../../test/msw/handlers/customersOrders";
import { server } from "../../test/msw/server";
import { mockViewport } from "../../test/viewport";

const clerk = makeUser({
  effectivePermissions: [
    "customers.view",
    "customers.create",
    "customers.update",
    "customers.deactivate",
    "customer_balances.view",
    "customer_payments.view",
    "customer_payments.create",
    "orders.view",
    "orders.create",
    "pos.access",
  ],
});

function renderAt(path: string, width = 1280) {
  mockViewport(width);
  server.use(...authHandlers(clerk));
  const router = createTestRouter([path]);
  render(
    <AppProviders client={createQueryClient({ retry: false })}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  return router;
}

describe("Customers", () => {
  beforeAll(async () => {
    await Promise.all([
      import("./pages/CustomersPage"),
      import("./pages/CustomerDetailPage"),
    ]);
  });

  it("lists customers with what they owe and creates one from the dialog", async () => {
    const store = makeCustomersOrdersStore();
    server.use(...customersOrdersHandlers(store));
    renderAt("/clients");

    const table = await screen.findByRole("table", { name: "Clients" });
    const row = within(table).getByText("Amel Trabelsi").closest("tr");
    expect(row).toHaveTextContent("30,000 TND");
    expect(row).toHaveTextContent("1");
    expect(table.textContent).not.toMatch(/customer-|sale-/);

    await userEvent.click(
      screen.getByRole("button", { name: "Nouveau client" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Nouveau client",
    });
    await userEvent.type(
      within(dialog).getByLabelText(/^Nom/),
      "Nadia Ben Salah",
    );
    await userEvent.type(
      within(dialog).getByLabelText(/Téléphone/),
      "98 765 432",
    );
    await userEvent.type(
      within(dialog).getByLabelText(/Adresse/),
      "12 rue de Carthage, Tunis",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enregistrer" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(store.customers.at(-1)).toMatchObject({
      name: "Nadia Ben Salah",
      phone: "98 765 432",
      address: "12 rue de Carthage, Tunis",
    });
    expect(
      await within(screen.getByRole("table", { name: "Clients" })).findByText(
        "Nadia Ben Salah",
      ),
    ).toBeInTheDocument();
  });

  // AS-013: a 15,000 TND payment reduces a 30,000 TND receivable to 15,000,
  // allocated to the open sale, collected at the open till.
  it("records a customer payment allocated to an open sale on a phone", async () => {
    const store = makeCustomersOrdersStore();
    server.use(...customersOrdersHandlers(store));
    renderAt("/clients/customer-1", 360);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Amel Trabelsi" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Reste à payer").parentElement).toHaveTextContent(
      "30,000 TND",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Encaisser un règlement" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Encaisser un règlement",
    });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: /^Montant/ }),
      "15",
    );
    await userEvent.click(
      await within(dialog).findByRole("switch", {
        name: /Encaissé à la caisse/,
      }),
    );
    await userEvent.type(
      await within(dialog).findByRole("textbox", {
        name: "Affectation VT-000001",
      }),
      "15",
    );
    expect(
      within(dialog).getByText("Reste à répartir").parentElement,
    ).toHaveTextContent("0,000 TND");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enregistrer le règlement" }),
    );

    expect(await screen.findByText("Règlement enregistré")).toBeInTheDocument();
    expect(store.payments[0]).toMatchObject({
      amountTnd: "15.000",
      sessionId: "session-1",
      allocations: [{ saleId: "sale-1", amountTnd: "15.000" }],
    });
    await waitFor(() =>
      expect(screen.getByText("Reste à payer").parentElement).toHaveTextContent(
        "15,000 TND",
      ),
    );
  });

  // CUS-009 and CUS-011: a règlement typed without any allocation still
  // settles the oldest open sale, the toast says which, and reversing it
  // from the Règlements tab gives the sale its balance back.
  it("settles the oldest sale by itself and reverses the règlement from the list", async () => {
    const store = makeCustomersOrdersStore();
    server.use(...customersOrdersHandlers(store));
    renderAt("/clients/customer-1");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Amel Trabelsi" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Encaisser un règlement" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Encaisser un règlement",
    });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: /^Montant/ }),
      "20",
    );
    await within(dialog).findByRole("textbox", {
      name: "Affectation VT-000001",
    });
    expect(
      within(dialog).getByText(
        "Le reste sera affecté aux documents les plus anciens.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enregistrer le règlement" }),
    );

    expect(
      await screen.findByText(/affecté à VT-000001 \(20,000 TND\)/),
    ).toBeInTheDocument();
    expect(store.payments[0]).toMatchObject({
      amountTnd: "20.000",
      allocations: [{ saleId: "sale-1", amountTnd: "20.000" }],
    });
    await waitFor(() =>
      expect(screen.getByText("Reste à payer").parentElement).toHaveTextContent(
        "10,000 TND",
      ),
    );

    await userEvent.click(screen.getByRole("tab", { name: "Règlements" }));
    const table = await screen.findByRole("table", {
      name: "Règlements du client",
    });
    expect(within(table).getByText("Encaissé")).toBeInTheDocument();
    await userEvent.click(
      within(table).getByRole("button", { name: "Actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Annuler le règlement" }),
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: "Annuler le règlement",
    });
    expect(confirm).toHaveTextContent("Le reste dû de VT-000001 est rétabli.");
    await userEvent.type(
      within(confirm).getByLabelText(/Motif/),
      "Montant saisi par erreur",
    );
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Annuler le règlement" }),
    );

    expect(await screen.findByText("Règlement annulé")).toBeInTheDocument();
    expect(store.payments[0]).toMatchObject({
      reversalReason: "Montant saisi par erreur",
    });
    expect(store.payments[0]?.reversedAt).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText("Reste à payer").parentElement).toHaveTextContent(
        "30,000 TND",
      ),
    );
    expect(
      within(
        screen.getByRole("table", { name: "Règlements du client" }),
      ).getByText("Annulé"),
    ).toBeInTheDocument();
  });

  it("refuses an overpayment inline before any request", async () => {
    const customer = makeCustomer({ id: "customer-1", name: "Amel Trabelsi" });
    const store = makeCustomersOrdersStore({
      customers: [customer],
      sales: [
        makeSale({
          id: "sale-1",
          reference: "VT-000001",
          customerId: customer.id,
          totalTnd: "30.000",
          remainingDueTnd: "30.000",
        }),
      ],
    });
    server.use(...customersOrdersHandlers(store));
    renderAt("/clients/customer-1");

    await userEvent.click(
      await screen.findByRole("button", { name: "Encaisser un règlement" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Encaisser un règlement",
    });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: /^Montant/ }),
      "40",
    );
    expect(
      within(dialog).getByText("Le montant dépasse le montant dû."),
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enregistrer le règlement" }),
    );
    expect(
      await within(dialog).findByText(
        "Le montant dépasse le reste à payer du client.",
      ),
    ).toBeInTheDocument();
    expect(store.payments).toHaveLength(0);
  });
  // Issue #46: the page figures count orders without the cancelled ones,
  // the Ventes tab lists the customer's sales with their state, and a
  // customer who still owes money cannot be deactivated.
  it("shows the figures without cancelled orders and refuses to deactivate a debtor", async () => {
    const customer = makeCustomer({ id: "customer-1", name: "Amel Trabelsi" });
    const store = makeCustomersOrdersStore({
      customers: [customer],
      orders: [
        makeOrder({
          id: "order-1",
          reference: "CMD-000001",
          customer,
          customerId: customer.id,
        }),
        makeOrder({
          id: "order-2",
          reference: "CMD-000002",
          customer,
          customerId: customer.id,
          status: "CANCELLED",
          cancelledAt: "2026-09-23T10:00:00.000Z",
        }),
      ],
    });
    server.use(...customersOrdersHandlers(store));
    renderAt("/clients/customer-1");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Amel Trabelsi" }),
    ).toBeInTheDocument();
    const tile = (label: string) =>
      screen
        .getAllByText(label, { selector: "span" })
        .map((node) => node.parentElement?.parentElement)
        .find((node) => node?.querySelector(".tabular-nums"));
    await waitFor(() =>
      expect(tile("Commandes")).toHaveTextContent(
        "1dont 1 ouverte · sans les annulées",
      ),
    );
    expect(tile("Ventes")).toHaveTextContent("130,000 TND");
    expect(tile("Payé")).toHaveTextContent("0,000 TNDaucun règlement");
    expect(tile("Dû")).toHaveTextContent("30,000 TND");

    const sales = await screen.findByRole("table", {
      name: "Ventes du client",
    });
    const row = within(sales).getByText("VT-000001").closest("tr");
    expect(row).toHaveTextContent("30,000 TND");
    expect(row).toHaveTextContent("Impayée");

    await userEvent.click(screen.getByRole("button", { name: "Désactiver" }));
    const confirm = await screen.findByRole("alertdialog", {
      name: "Désactiver Amel Trabelsi ?",
    });
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Désactiver" }),
    );

    expect(await screen.findByText("Solde en cours")).toBeInTheDocument();
    expect(store.customers[0]?.isActive).toBe(true);
    expect(
      screen.getByRole("button", { name: "Désactiver" }),
    ).toBeInTheDocument();
  });

  // Issue #46: a settled customer is deactivated from the list, leaves
  // the default "Actifs" view and shows as Inactif under the filter.
  it("deactivates a settled customer from the list and finds it under Inactifs", async () => {
    const store = makeCustomersOrdersStore();
    server.use(...customersOrdersHandlers(store));
    renderAt("/clients");

    const table = await screen.findByRole("table", { name: "Clients" });
    const row = within(table).getByText("Boulangerie Voisine").closest("tr");
    expect(row).not.toBeNull();
    await userEvent.click(
      within(row as HTMLElement).getByRole("button", { name: "Actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Désactiver" }),
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: "Désactiver Boulangerie Voisine ?",
    });
    expect(confirm).toHaveTextContent(
      "Le client ne sera plus proposé pour une vente à crédit",
    );
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Désactiver" }),
    );

    expect(await screen.findByText("Client désactivé")).toBeInTheDocument();
    expect(store.customers[1]).toMatchObject({
      name: "Boulangerie Voisine",
      isActive: false,
    });
    await waitFor(() =>
      expect(
        within(screen.getByRole("table", { name: "Clients" })).queryByText(
          "Boulangerie Voisine",
        ),
      ).not.toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("combobox", { name: "Statut" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "Inactifs" }),
    );
    const inactive = await within(
      screen.getByRole("table", { name: "Clients" }),
    ).findByText("Boulangerie Voisine");
    expect(inactive.closest("tr")).toHaveTextContent("Inactif");
    expect(
      within(screen.getByRole("table", { name: "Clients" })).queryByText(
        "Amel Trabelsi",
      ),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(inactive.closest("tr") as HTMLElement).getByRole("button", {
        name: "Actions",
      }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Réactiver" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Encaisser un règlement" }),
    ).not.toBeInTheDocument();
  });
});
