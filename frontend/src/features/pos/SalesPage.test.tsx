import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import {
  makeCustomer,
  makeSale as makeSaleSummary,
} from "../../test/factories/customers";
import { makePosSession, makeSale } from "../../test/factories/pos";
import { makeUser } from "../../test/factories/user";
import { authHandlers } from "../../test/msw/handlers/auth";
import {
  customersOrdersHandlers,
  makeCustomersOrdersStore,
} from "../../test/msw/handlers/customersOrders";
import { makePosStore, posHandlers } from "../../test/msw/handlers/pos";
import { server } from "../../test/msw/server";
import { mockViewport } from "../../test/viewport";

const manager = makeUser({
  effectivePermissions: [
    "pos.access",
    "pos.sell",
    "pos.cancel_sale",
    "customers.view",
    "customer_balances.view",
    "customer_payments.create",
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

describe("Sales list", () => {
  beforeAll(async () => {
    await import("./pos");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Issue #44: the figures follow the same filters as the list; a credit
  // sale offers "Encaisser le reste" prefilled with its balance; cancelling
  // a cash sale needs a reason and moves it out of the posted list.
  it("shows the figures, searches, collects the remainder and cancels a sale", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-23T10:00:00.000Z"));
    const amel = makeCustomer({ id: "customer-1", name: "Amel Trabelsi" });
    const store = makePosStore({
      session: makePosSession(),
      sessions: [makePosSession()],
      sales: [
        makeSale({ id: "sale-1", reference: "VT-000001" }),
        makeSale({
          id: "sale-2",
          reference: "VT-000002",
          customerId: amel.id,
          customer: amel,
          paymentState: "PARTIALLY_PAID",
          totalTnd: "18.000",
          paidAmountTnd: "10.000",
          remainingDueTnd: "8.000",
          soldAt: "2026-09-23T09:00:00.000Z",
        }),
      ],
    });
    const customers = makeCustomersOrdersStore({
      customers: [amel],
      sales: [
        makeSaleSummary({
          id: "sale-2",
          reference: "VT-000002",
          customerId: amel.id,
          totalTnd: "18.000",
          paidAmountTnd: "10.000",
          remainingDueTnd: "8.000",
          soldAt: "2026-09-23T09:00:00.000Z",
        }),
      ],
      orders: [],
    });
    server.use(...customersOrdersHandlers(customers), ...posHandlers(store));
    const router = renderAt("/caisse/ventes");

    const table = await screen.findByRole("table", { name: "Ventes" });
    expect(within(table).getByText("VT-000001")).toBeInTheDocument();
    expect(within(table).getByText("VT-000002")).toBeInTheDocument();
    expect(
      screen.getByText("Reste à encaisser").parentElement?.parentElement,
    ).toHaveTextContent("8,000 TND");
    expect(
      screen.getByText("1 payée · 1 partielle · 0 impayée"),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByRole("searchbox"), "amel");
    await waitFor(() =>
      expect(within(table).queryByText("VT-000001")).not.toBeInTheDocument(),
    );
    expect(within(table).getByText("VT-000002")).toBeInTheDocument();

    const creditRow = within(table)
      .getByText("VT-000002")
      .closest("tr") as HTMLElement;
    await userEvent.click(
      within(creditRow).getByRole("button", { name: "Actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Encaisser le reste" }),
    );
    const payment = await screen.findByRole("dialog", {
      name: "Encaisser un règlement",
    });
    expect(
      await within(payment).findByRole("textbox", {
        name: "Affectation VT-000002",
      }),
    ).toHaveValue("8,000");
    expect(
      within(payment).getByRole("textbox", { name: /^Montant/ }),
    ).toHaveValue("8,000");
    await userEvent.keyboard("{Escape}");

    await userEvent.clear(screen.getByRole("searchbox"));
    const cashRow = await waitFor(
      () => within(table).getByText("VT-000001").closest("tr") as HTMLElement,
    );
    await userEvent.click(
      within(cashRow).getByRole("button", { name: "Actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Annuler" }),
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: "Annuler VT-000001",
    });
    expect(confirm).toHaveTextContent("Caisse : −3,400 TND");
    expect(confirm).toHaveTextContent("+2 Pièce Pain complet");
    await userEvent.type(
      within(confirm).getByLabelText(/Motif/),
      "Erreur de saisie",
    );
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Annuler la vente" }),
    );

    expect(await screen.findByText("Vente annulée")).toBeInTheDocument();
    expect(store.sales.find((sale) => sale.id === "sale-1")).toMatchObject({
      status: "CANCELLED",
      cancellationReason: "Erreur de saisie",
    });
    await waitFor(() =>
      expect(within(table).queryByText("VT-000001")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("1 annulée hors total")).toBeInTheDocument();

    await router.navigate("/caisse/ventes?status=CANCELLED");
    const cancelledRow = await waitFor(
      () => within(table).getByText("VT-000001").closest("tr") as HTMLElement,
    );
    expect(cancelledRow).toHaveTextContent("Annulée");
    await userEvent.click(
      within(cancelledRow).getByRole("button", { name: "Actions" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Voir" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Annuler" })).toBeNull();
  }, 30_000);
});
