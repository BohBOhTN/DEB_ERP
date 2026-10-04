import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { RouterProvider } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import { makeOrder } from "../../test/factories/customers";
import { makeUser } from "../../test/factories/user";
import { apiV1 } from "../../test/msw/envelope";
import { authHandlers } from "../../test/msw/handlers/auth";
import {
  customersOrdersHandlers,
  makeCustomersOrdersStore,
} from "../../test/msw/handlers/customersOrders";
import { server } from "../../test/msw/server";
import { mockViewport } from "../../test/viewport";
import { boardQuery, isLate, presetsFor } from "./ordersBoard";

const clerk = makeUser({
  effectivePermissions: [
    "orders.view",
    "orders.create",
    "orders.update",
    "orders.change_status",
    "orders.complete",
    "orders.cancel",
    "customers.view",
    "customer_balances.view",
    "customer_payments.create",
    "pos.access",
  ],
});

function renderAt(
  path: string,
  width = 1280,
  permissions = clerk.effectivePermissions,
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

describe("Orders", () => {
  beforeAll(async () => {
    await Promise.all([
      import("./pages/OrdersPage"),
      import("./pages/OrderEditorPage"),
      import("./pages/OrderDetailPage"),
      import("./pages/OrderEditPage"),
    ]);
  });

  // AS-009 and AS-V2-17 on a phone: an order for tomorrow with a 20,000 TND
  // advance taken at the open till, in the same flow.
  it("creates an order for tomorrow with an advance while a session is open", async () => {
    const store = makeCustomersOrdersStore();
    server.use(...customersOrdersHandlers(store));
    renderAt("/commandes/nouvelle", 360);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Nouvelle commande",
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("combobox", { name: "Client" }));
    await userEvent.type(
      screen.getByPlaceholderText("Nom ou téléphone du client"),
      "amel",
    );
    await userEvent.click(await screen.findByText("Amel Trabelsi"));
    await userEvent.click(screen.getByRole("combobox", { name: "Produit 1" }));
    await userEvent.type(
      screen.getByPlaceholderText("Rechercher produit"),
      "pain",
    );
    await userEvent.click(await screen.findByText("Pain complet"));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Quantité 1" }),
      "10",
    );
    // The price comes from the catalogue and is shown, not edited (#45).
    expect(
      screen.queryByRole("textbox", { name: "Prix unitaire 1" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("4,000 TND")).toBeInTheDocument();
    await userEvent.type(
      await screen.findByRole("textbox", { name: /Acompte/ }),
      "20",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Enregistrer la commande" }),
    );

    expect(await screen.findByText("Commande enregistrée")).toBeInTheDocument();
    const order = store.orders[0];
    expect(order).toMatchObject({
      status: "DRAFT",
      totalTnd: "40.000",
      advanceBalanceTnd: "20.000",
    });
    expect(order?.advances?.[0]).toMatchObject({ amountTnd: "20.000" });
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: order?.reference ?? "",
      }),
    ).toBeInTheDocument();
  });

  // AS-010 and AS-V2-17: completing the order pays the remainder, creates
  // the linked sale, applies the advance and leaves nothing due.
  it("moves an order through the transitions and completes it with the remainder paid", async () => {
    const store = makeCustomersOrdersStore({
      orders: [
        makeOrder({
          id: "order-1",
          reference: "CMD-000001",
          status: "CONFIRMED",
          totalTnd: "40.000",
          advanceBalanceTnd: "20.000",
          advances: [
            {
              id: "advance-1",
              movement: "RECEIPT",
              amountTnd: "20.000",
              paidAt: "2026-09-23T08:00:00.000Z",
              notes: null,
            },
          ],
        }),
      ],
    });
    server.use(...customersOrdersHandlers(store));
    renderAt("/commandes/order-1");

    expect(
      await screen.findByRole("heading", { level: 1, name: "CMD-000001" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "En préparation" }),
    );
    expect(
      await screen.findByText("Commande en préparation"),
    ).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Prête" }));
    expect(await screen.findByText("Commande prête")).toBeInTheDocument();

    await userEvent.click(
      await screen.findByRole("button", { name: "Terminer" }),
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: "Terminer CMD-000001",
    });
    expect(confirm).toHaveTextContent("Acompte appliqué : 20,000 TND.");
    await userEvent.type(
      within(confirm).getByRole("textbox", { name: /^Montant/ }),
      "20",
    );
    expect(confirm).toHaveTextContent("Rien ne reste dû.");
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Terminer la commande" }),
    );

    expect(await screen.findByText("Commande terminée")).toBeInTheDocument();
    expect(store.orders[0]).toMatchObject({
      status: "COMPLETED",
      saleId: store.sales[0]?.id,
    });
    expect(store.sales[0]).toMatchObject({
      totalTnd: "40.000",
      paidAmountTnd: "40.000",
      remainingDueTnd: "0.000",
      paymentState: "PAID",
    });
    expect(await screen.findByText("Vente liée")).toBeInTheDocument();
    expect(
      screen.getByText(store.sales[0]?.reference ?? ""),
    ).toBeInTheDocument();
  });

  // AS-012: cancelling with an advance asks refund or credit explicitly.
  it("cancels an order with an advance after choosing what happens to the money", async () => {
    const store = makeCustomersOrdersStore({
      orders: [
        makeOrder({
          id: "order-1",
          reference: "CMD-000001",
          status: "CONFIRMED",
          advanceBalanceTnd: "10.000",
        }),
      ],
    });
    server.use(...customersOrdersHandlers(store));
    renderAt("/commandes/order-1");

    await userEvent.click(
      await screen.findByRole("button", { name: "Annuler" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Annuler CMD-000001",
    });
    expect(dialog).toHaveTextContent("Acompte de 10,000 TND : remboursé");
    await userEvent.click(
      within(dialog).getByRole("radio", { name: "Conserver en avoir" }),
    );
    expect(dialog).toHaveTextContent("conservé comme avoir du client");
    await userEvent.type(
      within(dialog).getByLabelText(/Motif/),
      "Client absent",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Annuler la commande" }),
    );

    expect(await screen.findByText("Commande annulée")).toBeInTheDocument();
    expect(store.orders[0]).toMatchObject({
      status: "CANCELLED",
      cancellationReason: "Client absent",
      advanceDisposition: "CREDITED",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Issue #45: the queue carries the figures and the actions of the detail
  // page. A deposit above the remainder is refused inline; completing with
  // nothing paid leaves the remainder on the customer's account.
  it("acts on an order from its row: a capped deposit, then a completion that states nothing paid", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-23T09:00:00.000Z"));
    const store = makeCustomersOrdersStore({
      orders: [
        makeOrder({
          id: "order-1",
          reference: "CMD-000001",
          status: "CONFIRMED",
          totalTnd: "40.000",
          advanceBalanceTnd: "10.000",
          advances: [
            {
              id: "advance-1",
              movement: "RECEIPT",
              amountTnd: "10.000",
              paidAt: "2026-09-22T08:00:00.000Z",
              notes: null,
            },
          ],
          requestedFulfillmentAt: new Date(
            Date.now() + 2 * 60 * 60 * 1000,
          ).toISOString(),
        }),
      ],
    });
    server.use(...customersOrdersHandlers(store));
    renderAt("/commandes", 1280);

    const table = await screen.findByRole("table", { name: "Commandes" });
    const row = within(table)
      .getByText("CMD-000001")
      .closest("tr") as HTMLElement;
    expect(row).toHaveTextContent("10,000 TND");
    expect(row).toHaveTextContent("30,000 TND");
    expect(
      screen.getByText("Commandes ouvertes").parentElement?.parentElement,
    ).toHaveTextContent("1");
    expect(
      screen.getByText("Reste à encaisser").parentElement?.parentElement,
    ).toHaveTextContent("30,000 TND");

    await userEvent.click(within(row).getByRole("button", { name: "Actions" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Encaisser un acompte" }),
    );
    const deposit = await screen.findByRole("dialog", {
      name: "Encaisser un acompte",
    });
    expect(within(deposit).getByText("Reste à verser")).toBeInTheDocument();
    expect(within(deposit).queryByRole("button", { name: "50" })).toBeNull();
    await userEvent.type(
      within(deposit).getByRole("textbox", { name: /^Montant/ }),
      "35",
    );
    await userEvent.click(
      within(deposit).getByRole("button", { name: "Encaisser" }),
    );
    expect(
      await within(deposit).findByText(
        "L'acompte dépasse le reste à verser sur la commande.",
      ),
    ).toBeInTheDocument();
    // Only the fixture's advance: the refused one never reached the server.
    expect(store.orders[0]?.advances).toHaveLength(1);
    await userEvent.keyboard("{Escape}");

    await userEvent.click(within(row).getByRole("button", { name: "Actions" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Terminer" }),
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: "Terminer CMD-000001",
    });
    expect(confirm).toHaveTextContent(
      "Reste à payer porté au compte client : 30,000 TND.",
    );
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Terminer la commande" }),
    );

    expect(await screen.findByText("Commande terminée")).toBeInTheDocument();
    expect(store.sales[0]).toMatchObject({
      paidAmountTnd: "10.000",
      remainingDueTnd: "30.000",
      paymentState: "PARTIALLY_PAID",
    });
  });

  it("shows the board with the today queue and hides transitions without permission", async () => {
    // Pinned at 10:00 in Africa/Tunis so "now plus two hours" is still on
    // today's board whatever the hour the suite runs at.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-23T09:00:00.000Z"));
    const store = makeCustomersOrdersStore({
      orders: [
        makeOrder({
          id: "order-1",
          reference: "CMD-000001",
          requestedFulfillmentAt: new Date(
            Date.now() + 2 * 60 * 60 * 1000,
          ).toISOString(),
        }),
      ],
    });
    server.use(...customersOrdersHandlers(store));
    renderAt("/commandes", 1280, [
      "orders.view",
      "customers.view",
      "customer_balances.view",
    ]);

    const table = await screen.findByRole("table", { name: "Commandes" });
    expect(within(table).getByText("CMD-000001")).toBeInTheDocument();
    expect(within(table).getByText(/dans 2 h/)).toBeInTheDocument();
    expect(table.textContent).not.toMatch(/order-|customer-/);
    expect(
      screen.queryByRole("button", { name: "Nouvelle commande" }),
    ).not.toBeInTheDocument();

    await userEvent.click(within(table).getByText("CMD-000001"));
    expect(
      await screen.findByRole("heading", { level: 1, name: "CMD-000001" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Terminer" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Annuler" }),
    ).not.toBeInTheDocument();
  });

  // Issue 015: the client read the page as broken because it opened on
  // "not yet due, today": orders for tomorrow and orders past their hour
  // were both hidden and every figure read 0.
  describe("the queue by default (issue 015)", () => {
    function queue() {
      // 10:00 in Tunis on Wednesday 23 September 2026.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-09-23T09:00:00.000Z"));
      return makeCustomersOrdersStore({
        orders: [
          makeOrder({
            id: "order-1",
            reference: "CMD-000001",
            requestedFulfillmentAt: "2026-09-24T08:00:00.000Z",
          }),
          makeOrder({
            id: "order-2",
            reference: "CMD-000002",
            status: "DRAFT",
            requestedFulfillmentAt: "2026-09-29T15:00:00.000Z",
          }),
          makeOrder({
            id: "order-3",
            reference: "CMD-000003",
            requestedFulfillmentAt: "2026-09-23T08:00:00.000Z",
          }),
          makeOrder({
            id: "order-4",
            reference: "CMD-000004",
            status: "COMPLETED",
            requestedFulfillmentAt: "2026-09-22T09:00:00.000Z",
            completedAt: "2026-09-22T09:10:00.000Z",
          }),
        ],
      });
    }

    function captureListRequests() {
      const requests: URLSearchParams[] = [];
      server.use(
        http.get(`${apiV1}/orders`, ({ request }) => {
          requests.push(new URL(request.url).searchParams);
          // Fall through to the store's handler.
          return undefined;
        }),
      );
      return requests;
    }

    const references = (table: HTMLElement) =>
      within(table)
        .getAllByText(/^CMD-\d{6}$/)
        .map((cell) => cell.textContent);

    it("opens on every open order, late or not, with real figures", async () => {
      server.use(...customersOrdersHandlers(queue()));
      const requests = captureListRequests();
      renderAt("/commandes", 1280);

      const table = await screen.findByRole("table", { name: "Commandes" });
      // Soonest first: the late one, tomorrow's, next week's. Not the
      // completed one.
      expect(references(table)).toEqual([
        "CMD-000003",
        "CMD-000001",
        "CMD-000002",
      ]);
      expect(requests[0]?.get("open")).toBe("true");
      expect(requests[0]?.get("dueAfter")).toBeNull();
      expect(requests[0]?.get("dueState")).toBeNull();
      expect(screen.getByRole("radio", { name: "Toutes" })).toBeChecked();
      expect(screen.getByText("Toutes les dates")).toBeInTheDocument();

      expect(
        screen.getByText("Commandes ouvertes").parentElement?.parentElement,
      ).toHaveTextContent("3");
      const late = within(table).getByText("CMD-000003").closest("tr");
      expect(late).toHaveTextContent("En retard · il y a 1 h");
      expect(
        within(table).getByText("CMD-000001").closest("tr"),
      ).not.toHaveTextContent("En retard");
    });

    it("narrows the queue to tomorrow, then to the next seven days", async () => {
      server.use(...customersOrdersHandlers(queue()));
      const requests = captureListRequests();
      renderAt("/commandes", 1280);
      const table = await screen.findByRole("table", { name: "Commandes" });

      await userEvent.click(screen.getByRole("radio", { name: "Demain" }));
      await waitFor(() => expect(references(table)).toEqual(["CMD-000001"]));
      // Thursday 24 September, a whole day in Tunis.
      expect(requests.at(-1)?.get("dueAfter")).toBe("2026-09-23T23:00:00.000Z");
      expect(requests.at(-1)?.get("dueBefore")).toBe(
        "2026-09-24T22:59:59.999Z",
      );

      await userEvent.click(screen.getByRole("radio", { name: "7 jours" }));
      await waitFor(() =>
        expect(references(table)).toEqual([
          "CMD-000003",
          "CMD-000001",
          "CMD-000002",
        ]),
      );
      expect(requests.at(-1)?.get("dueBefore")).toBe(
        "2026-09-29T22:59:59.999Z",
      );
    });

    it("offers backward windows on a closed tab and lists everything under Toutes", async () => {
      server.use(...customersOrdersHandlers(queue()));
      renderAt("/commandes?period=tomorrow", 1280);
      const table = await screen.findByRole("table", { name: "Commandes" });
      expect(screen.getByRole("radio", { name: "Demain" })).toBeChecked();

      await userEvent.click(screen.getByRole("tab", { name: "Terminées" }));
      // "Demain" is not a window of the past: the tab falls back to every
      // date instead of filtering by something it does not show.
      expect(
        screen.getAllByRole("radio").map((radio) => radio.textContent),
      ).toEqual([
        "Toutes",
        "Aujourd'hui",
        "Cette semaine",
        "Ce mois",
        "Personnalisée",
      ]);
      expect(screen.getByRole("radio", { name: "Toutes" })).toBeChecked();
      await waitFor(() => expect(references(table)).toEqual(["CMD-000004"]));

      await userEvent.click(screen.getByRole("tab", { name: "Toutes" }));
      await waitFor(() => expect(references(table)).toHaveLength(4));
    });

    it("keeps the rules of the board in one place", () => {
      const window = { from: "2026-09-24", to: "2026-09-24" };
      expect(boardQuery("todo", { from: "", to: "" })).toEqual({ open: true });
      expect(boardQuery("todo", window)).toEqual({
        open: true,
        dueAfter: "2026-09-23T23:00:00.000Z",
        dueBefore: "2026-09-24T22:59:59.999Z",
      });
      // Overdue is dated by definition: the window does not apply.
      expect(boardQuery("overdue", window)).toEqual({ dueState: "OVERDUE" });
      expect(boardQuery("all", { from: "", to: "" })).toEqual({});
      expect(presetsFor("ready")).toContain("next7");
      expect(presetsFor("cancelled")).not.toContain("tomorrow");

      const now = new Date("2026-09-23T09:00:00.000Z");
      const due = "2026-09-23T08:00:00.000Z";
      expect(
        isLate({ status: "READY", requestedFulfillmentAt: due }, now),
      ).toBe(true);
      expect(
        isLate({ status: "COMPLETED", requestedFulfillmentAt: due }, now),
      ).toBe(false);
    });

    it("edits a confirmed order from its row and sends its lines only when they change", async () => {
      const store = queue();
      server.use(...customersOrdersHandlers(store));
      const bodies: Array<Record<string, unknown>> = [];
      server.use(
        http.patch(`${apiV1}/orders/:id`, async ({ request }) => {
          bodies.push(
            (await request.clone().json()) as Record<string, unknown>,
          );
          return undefined;
        }),
      );
      renderAt("/commandes", 1280);
      const table = await screen.findByRole("table", { name: "Commandes" });

      // A draft and a confirmed order can be edited; a completed one cannot.
      const row = within(table).getByText("CMD-000001").closest("tr");
      await userEvent.click(
        within(row as HTMLElement).getByRole("button", { name: "Actions" }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Modifier" }),
      );

      expect(
        await screen.findByRole("heading", {
          level: 1,
          name: "Modifier CMD-000001",
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("Amel Trabelsi")).toBeInTheDocument();
      await userEvent.type(
        screen.getByRole("textbox", { name: "Notes" }),
        "Sans sésame",
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Enregistrer les modifications" }),
      );

      expect(
        await screen.findByRole("heading", { level: 1, name: "CMD-000001" }),
      ).toBeInTheDocument();
      expect(bodies[0]).toMatchObject({ version: 1, notes: "Sans sésame" });
      // Same products, same quantities: the agreed prices are left alone.
      expect(bodies[0]).not.toHaveProperty("lines");
      expect(
        store.orders.find((order) => order.id === "order-1"),
      ).toMatchObject({ notes: "Sans sésame", version: 2 });

      await userEvent.click(screen.getByRole("button", { name: "Modifier" }));
      const quantity = await screen.findByRole("textbox", {
        name: "Quantité 1",
      });
      await userEvent.clear(quantity);
      await userEvent.type(quantity, "12");
      await userEvent.click(
        screen.getByRole("button", { name: "Enregistrer les modifications" }),
      );

      await waitFor(() => expect(bodies).toHaveLength(2));
      expect(bodies[1]).toMatchObject({
        version: 2,
        lines: [{ productId: "product-1", quantity: "12" }],
      });
    });

    it("refuses to edit an order that is being prepared", async () => {
      const store = queue();
      store.orders[0]!.status = "PREPARING";
      server.use(...customersOrdersHandlers(store));
      renderAt("/commandes/order-1/modifier", 1280);

      expect(
        await screen.findByText("Commande non modifiable"),
      ).toBeInTheDocument();
    });
  });
});
