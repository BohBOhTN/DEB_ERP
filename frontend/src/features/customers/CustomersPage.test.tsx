import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import { makeCustomer, makeSale } from "../../test/factories/customers";
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
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Enregistrer" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(store.customers.at(-1)).toMatchObject({
      name: "Nadia Ben Salah",
      phone: "98 765 432",
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
});
