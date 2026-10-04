import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { invalidateAfter, primeDetail, roots, rootsFor } from "./invalidation";

const has = (event: Parameters<typeof rootsFor>[0], root: readonly string[]) =>
  rootsFor(event).some((candidate) => candidate.join("/") === root.join("/"));

describe("invalidation map", () => {
  // AS-V2-27: a sale at the till refreshes stock, receivables, the order
  // queue and the home summary, and leaves the catalogue alone.
  it("refreshes what a POS sale touches and nothing else", () => {
    for (const root of [
      roots.posSession,
      roots.posSales,
      roots.inventory,
      roots.customers,
      roots.orders,
      roots.home,
      roots.audit,
    ]) {
      expect(has("pos.sale", root)).toBe(true);
    }
    expect(has("pos.sale", roots.catalogProducts)).toBe(false);
    expect(has("pos.sale", roots.catalogReference)).toBe(false);
    expect(has("pos.sale", roots.procurement)).toBe(false);
  });

  // Issue #66: a règlement changes the paid state of the sales it settles.
  it("refreshes the sales list and the receipt after a customer payment", () => {
    expect(has("customer.payment", roots.posSales)).toBe(true);
    expect(has("customer.payment", roots.posSale)).toBe(true);
    expect(has("customer.payment", roots.inventory)).toBe(false);
  });

  // Issue 014: the analyses read posted sales, distributor documents and
  // expenses; the session history prints each session's sales.
  it("refreshes the analyses and the session history after what changes their figures", () => {
    for (const event of [
      "pos.sale",
      "order",
      "customer.payment",
      "distribution.sale",
      "distribution.settlement",
      "expense",
      "catalog.product",
      "customer.record",
    ] as const) {
      expect(has(event, roots.analytics)).toBe(true);
    }
    expect(has("pos.sale", roots.posSessions)).toBe(true);
    expect(has("order", roots.posSessions)).toBe(true);
    // A purchase or a stock movement changes no analysed figure.
    expect(has("procurement.purchase", roots.analytics)).toBe(false);
    expect(has("inventory.movement", roots.analytics)).toBe(false);
    expect(has("distribution.dispatch", roots.analytics)).toBe(false);
  });

  it("keeps a customer rename away from stock and the till", () => {
    expect(has("customer.record", roots.customersList)).toBe(true);
    expect(has("customer.record", roots.inventory)).toBe(false);
    expect(has("customer.record", roots.posSession)).toBe(false);
    expect(has("customer.record", roots.home)).toBe(false);
  });

  it("refreshes reference readers when a unit or category changes", () => {
    expect(has("catalog.reference", roots.catalogReference)).toBe(true);
    expect(has("catalog.reference", roots.catalogProducts)).toBe(true);
    expect(has("catalog.reference", roots.posProducts)).toBe(true);
    expect(has("catalog.reference", roots.inventory)).toBe(false);
  });

  it("follows every event with the audit journal and a permission change with the session", () => {
    for (const event of ["expense", "simulation", "order", "access"] as const) {
      expect(has(event, roots.audit)).toBe(true);
    }
    expect(has("access", roots.session)).toBe(true);
  });

  it("invalidates one query per root through the client", async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    await invalidateAfter(client, "expense.category");
    expect(spy.mock.calls.map((call) => call[0]?.queryKey)).toEqual([
      ["expenses", "categories"],
      ["expenses", "list"],
      ["audit"],
    ]);
  });

  it("primes a detail so an edit shows at once", () => {
    const client = new QueryClient();
    primeDetail(client, ["customers", "detail", "c1"], { name: "Amel" });
    expect(client.getQueryData(["customers", "detail", "c1"])).toEqual({
      name: "Amel",
    });
  });
});
