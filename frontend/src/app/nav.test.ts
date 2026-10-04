import { describe, expect, it } from "vitest";
import { toPermissionSet } from "../lib/auth/permissions";
import { activeNavItem, navItems, visibleNavItems } from "./nav";

describe("navigation manifest", () => {
  it("filters items by permission and keeps Accueil for everyone", () => {
    const cashier = visibleNavItems(
      toPermissionSet(["pos.access", "orders.view"]),
    );

    expect(cashier.map((item) => item.id)).toEqual([
      "home",
      "pos",
      "sales",
      "sessions",
      "orders",
    ]);
    expect(visibleNavItems(toPermissionSet([])).map((item) => item.id)).toEqual(
      ["home"],
    );
  });

  it("shows Analyses only with analytics.view, right under Accueil", () => {
    expect(
      visibleNavItems(toPermissionSet(["pos.access"])).some(
        (item) => item.id === "analytics",
      ),
    ).toBe(false);
    expect(
      visibleNavItems(toPermissionSet(["analytics.view", "pos.access"])).map(
        (item) => item.id,
      ),
    ).toEqual(["home", "analytics", "pos", "sales", "sessions"]);
  });

  it("shows Catégories et unités with either of its permissions", () => {
    expect(
      visibleNavItems(toPermissionSet(["units.view"])).some(
        (item) => item.id === "catalogueSettings",
      ),
    ).toBe(true);
  });

  it("marks exactly four phone primaries", () => {
    expect(
      navItems.filter((item) => item.mobilePrimary).map((item) => item.label),
    ).toEqual(["Accueil", "Caisse", "Commandes", "Clients"]);
  });

  it("resolves the active item by the longest matching path", () => {
    expect(activeNavItem("/caisse/ventes")?.id).toBe("sales");
    expect(activeNavItem("/caisse/sessions")?.id).toBe("sessions");
    expect(activeNavItem("/caisse/sessions/abc")?.id).toBe("sessions");
    expect(activeNavItem("/analyses")?.id).toBe("analytics");
    expect(activeNavItem("/distribution/reglements")?.id).toBe("settlements");
    expect(activeNavItem("/")?.id).toBe("home");
    expect(activeNavItem("/inconnu")).toBeUndefined();
  });
});
