import { render, screen, within } from "@testing-library/react";
import { http } from "msw";
import { RouterProvider } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import { toBusinessDate } from "../../i18n/format";
import { makePosSession, makeSale } from "../../test/factories/pos";
import { makeUser } from "../../test/factories/user";
import { apiV1 } from "../../test/msw/envelope";
import { authHandlers } from "../../test/msw/handlers/auth";
import {
  makePosStore,
  posHandlers,
  type PosStore,
} from "../../test/msw/handlers/pos";
import { server } from "../../test/msw/server";
import { mockViewport } from "../../test/viewport";
import { sessionDuration } from "./sessionFormat";

/// Issue 014: the till sessions are a navigation entry of their own, the
/// history opens on the month with its totals, and a session page says what
/// the session looked like.
const closed = (overrides: Parameters<typeof makePosSession>[0] = {}) =>
  makePosSession({
    status: "CLOSED",
    openedAt: "2026-09-23T05:30:00.000Z",
    closedAt: "2026-09-23T17:30:00.000Z",
    expectedCashTnd: "81.400",
    countedCashTnd: "80.000",
    cashDifferenceTnd: "-1.400",
    closedBy: { id: "user-1", displayName: "Salma Ben Ali" },
    ...overrides,
  });

function renderAt(path: string, store: PosStore) {
  mockViewport(1280);
  server.use(
    ...authHandlers(
      makeUser({ effectivePermissions: ["pos.access", "products.view"] }),
    ),
    ...posHandlers(store),
  );
  render(
    <AppProviders client={createQueryClient({ retry: false })}>
      <RouterProvider router={createTestRouter([path])} />
    </AppProviders>,
  );
}

describe("Sessions de caisse", () => {
  beforeAll(async () => {
    await import("./pos");
  });

  it("is reachable from the navigation", async () => {
    renderAt("/caisse/sessions", makePosStore({ sessions: [closed()] }));

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Sessions de caisse",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Sessions de caisse" }),
    ).toHaveAttribute("href", "/caisse/sessions");
  });

  it("opens on the month and totals the sessions it lists", async () => {
    const periods: Array<[string | null, string | null]> = [];
    const store = makePosStore({
      sessions: [
        closed({ id: "session-1" }),
        closed({
          id: "session-2",
          openedAt: "2026-09-22T05:30:00.000Z",
          closedAt: "2026-09-22T12:15:00.000Z",
          cashDifferenceTnd: "2.000",
        }),
      ],
      sales: [
        makeSale({ sessionId: "session-1", totalTnd: "30.000" }),
        makeSale({ sessionId: "session-1", totalTnd: "20.000" }),
        makeSale({ sessionId: "session-2", totalTnd: "10.000" }),
      ],
    });
    renderAt("/caisse/sessions", store);
    server.use(
      http.get(`${apiV1}/pos/sessions`, ({ request }) => {
        const url = new URL(request.url);
        periods.push([
          url.searchParams.get("from"),
          url.searchParams.get("to"),
        ]);
        // Fall through to the store's own handler.
        return undefined;
      }),
    );

    const table = await screen.findByRole("table", {
      name: "Sessions de caisse",
    });
    const today = toBusinessDate(new Date());
    expect(periods[0]).toEqual([`${today.slice(0, 8)}01`, today]);
    expect(screen.getByRole("radio", { name: "Ce mois" })).toBeChecked();

    // Two sessions, 60 TND of sales, a shortage and a surplus named apart.
    expect(await screen.findByText("toutes clôturées")).toBeInTheDocument();
    expect(screen.getByText("Ventes des sessions")).toBeInTheDocument();
    expect(screen.getByText("60,000")).toBeInTheDocument();
    expect(screen.getByText("3 ventes")).toBeInTheDocument();
    expect(screen.getByText("Moyenne par session")).toBeInTheDocument();
    expect(screen.getByText("30,000")).toBeInTheDocument();
    expect(screen.getByText("Écart de caisse cumulé")).toBeInTheDocument();
    expect(screen.getByText("0,600")).toBeInTheDocument();
    expect(
      screen.getByText(/^manque -1,400.TND · excédent 2,000.TND$/),
    ).toBeInTheDocument();
    // The till stayed open twelve hours, then six hours and three quarters.
    expect(within(table).getByText("12 h 00")).toBeInTheDocument();
    expect(within(table).getByText("6 h 45")).toBeInTheDocument();
  });

  it("tells what a session looked like: duration, basket, hours and best products", async () => {
    const line = (
      productId: string,
      name: string,
      quantity: string,
      total: string,
    ) => ({
      id: `line-${productId}-${total}`,
      productId,
      quantity,
      unitPriceTnd: "1.000",
      lineTotalTnd: total,
      productNameSnapshot: name,
      unitNameSnapshot: "Pièce",
    });
    const store = makePosStore({
      sessions: [closed()],
      sales: [
        // 08:30 and 08:50 UTC are the 9 h hour in Tunis; 11:10 UTC is 12 h.
        makeSale({
          soldAt: "2026-09-23T08:30:00.000Z",
          totalTnd: "12.000",
          lines: [line("product-1", "Pain complet", "10.000000", "12.000")],
        }),
        makeSale({
          soldAt: "2026-09-23T08:50:00.000Z",
          totalTnd: "20.000",
          paidAmountTnd: "5.000",
          remainingDueTnd: "15.000",
          paymentState: "PARTIALLY_PAID",
          lines: [line("product-2", "Croissant", "20.000000", "20.000")],
        }),
        makeSale({
          soldAt: "2026-09-23T11:10:00.000Z",
          totalTnd: "4.000",
          lines: [line("product-2", "Croissant", "4.000000", "4.000")],
        }),
        makeSale({ status: "CANCELLED", totalTnd: "99.000" }),
      ],
    });
    renderAt("/caisse/sessions/session-1", store);

    expect(
      await screen.findByRole("heading", { level: 1, name: /Session du/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Panier moyen")).toBeInTheDocument();
    expect(screen.getByText("12,000")).toBeInTheDocument();
    expect(screen.getByText("Durée")).toBeInTheDocument();
    expect(screen.getByText("12 h 00")).toBeInTheDocument();
    // What is still owed today, not what was granted at the till.
    expect(screen.getByText("Reste à encaisser")).toBeInTheDocument();
    expect(screen.queryByText("Crédit accordé")).toBeNull();
    expect(screen.getByText("Ventes annulées")).toBeInTheDocument();

    const hours = screen.getByRole("figure", { name: "Ventes par heure" });
    expect(
      within(hours)
        .getAllByRole("button")
        .map((bar) => bar.getAttribute("aria-label")?.replace(/\s/g, " ")),
    ).toEqual([
      "9h : 2 ventes, 32,000 TND",
      "10h : 0 vente, 0,000 TND",
      "11h : 0 vente, 0,000 TND",
      "12h : 1 vente, 4,000 TND",
    ]);
    const best = screen.getByRole("list", {
      name: "Meilleurs produits de la session",
    });
    expect(
      within(best)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Croissant", "Pain complet"]);
    expect(
      within(best).getByRole("link", { name: "Croissant" }),
    ).toHaveAttribute("href", "/produits/product-2");
    expect(
      within(best).getByText(/^24,000.TND · 24.Pièce$/),
    ).toBeInTheDocument();
  });

  it("says so when a session has no sale", async () => {
    renderAt(
      "/caisse/sessions/session-1",
      makePosStore({ sessions: [closed()] }),
    );

    expect(
      await screen.findByText("Aucune vente sur cette session"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("figure", { name: "Ventes par heure" }),
    ).toBeNull();
  });

  it("measures how long the till stayed open", () => {
    const openedAt = "2026-09-23T05:30:00.000Z";

    expect(
      sessionDuration({ openedAt, closedAt: "2026-09-23T17:00:00.000Z" }),
    ).toBe("11 h 30");
    expect(
      sessionDuration({ openedAt, closedAt: "2026-09-23T06:15:00.000Z" }),
    ).toBe("45 min");
    // Still open: measured up to now.
    expect(
      sessionDuration(
        { openedAt, closedAt: null },
        new Date("2026-09-23T07:35:00.000Z"),
      ),
    ).toBe("2 h 05");
  });
});
