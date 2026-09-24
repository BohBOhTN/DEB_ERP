import { focusManager } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import { makeUser } from "../../test/factories/user";
import { authHandlers } from "../../test/msw/handlers/auth";
import {
  catalogHandlers,
  makeCatalogStore,
} from "../../test/msw/handlers/catalog";
import { server } from "../../test/msw/server";
import { mockViewport } from "../../test/viewport";

const manager = makeUser({
  effectivePermissions: [
    "products.view",
    "products.create",
    "products.update",
    "raw_materials.view",
    "raw_materials.create",
    "categories.view",
    "categories.manage",
    "units.view",
    "units.manage",
    "inventory.view",
  ],
});

/// Requests by API path since the test started.
function countRequests() {
  const counts = new Map<string, number>();
  const listener = ({ request }: { request: Request }) => {
    const path = new URL(request.url).pathname.replace(/^.*\/api\/v1/, "");
    counts.set(path, (counts.get(path) ?? 0) + 1);
  };
  server.events.on("request:start", listener);
  return {
    of: (path: string) => counts.get(path) ?? 0,
    stop: () => server.events.removeListener("request:start", listener),
  };
}

describe("reference cache (UI-26)", () => {
  beforeAll(async () => {
    await Promise.all([
      import("../../features/catalog/pages/ProductsPage"),
      import("../../features/catalog/pages/RawMaterialsPage"),
      import("../../features/catalog/pages/CatalogSettingsPage"),
    ]);
  });

  let stop = () => undefined as void;
  afterEach(() => {
    stop();
    vi.useRealTimers();
    focusManager.setFocused(undefined);
  });

  // AS-V2-26: units and categories are read once per session, shared by
  // every screen that needs them, and refreshed only after their own
  // mutation; a product edit leaves them alone (AS-V2-27).
  it("fetches units once for the session and again only after a unit changes", async () => {
    mockViewport(1280);
    const store = makeCatalogStore();
    server.use(...authHandlers(manager), ...catalogHandlers(store));
    const requests = countRequests();
    stop = requests.stop;
    const router = createTestRouter(["/produits"]);
    render(
      <AppProviders client={createQueryClient({ retry: false })}>
        <RouterProvider router={router} />
      </AppProviders>,
    );

    // The shell warms the reference caches as soon as the session is known.
    await screen.findByRole("heading", { level: 1, name: "Produits" });
    await waitFor(() => expect(requests.of("/catalog/units")).toBe(1));
    await waitFor(() => expect(requests.of("/catalog/categories")).toBe(1));

    // Two dialogs on two pages reuse the warm caches: no new request.
    await userEvent.click(
      screen.getByRole("button", { name: "Nouveau produit" }),
    );
    const productDialog = await screen.findByRole("dialog", {
      name: "Nouveau produit",
    });
    expect(
      within(productDialog).getByRole("combobox", { name: /Unité de base/ }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await router.navigate("/matieres-premieres");
    await screen.findByRole("heading", {
      level: 1,
      name: "Matières premières",
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Nouvelle matière première" }),
    );
    await screen.findByRole("dialog", { name: /matière première/i });
    await userEvent.keyboard("{Escape}");
    expect(requests.of("/catalog/units")).toBe(1);
    expect(requests.of("/catalog/categories")).toBe(1);

    // A list revisited within its 30 s window is served from the cache.
    await router.navigate("/produits");
    await screen.findByRole("heading", { level: 1, name: "Produits" });
    expect(requests.of("/catalog/products")).toBe(1);

    // Two minutes later the window regains focus: the products list is
    // stale and re-read, the reference data is not.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 2 * 60_000));
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await waitFor(() => expect(requests.of("/catalog/products")).toBe(2));
    await userEvent.click(
      screen.getByRole("button", { name: "Nouveau produit" }),
    );
    await screen.findByRole("dialog", { name: "Nouveau produit" });
    await userEvent.keyboard("{Escape}");
    expect(requests.of("/catalog/units")).toBe(1);
    expect(requests.of("/catalog/categories")).toBe(1);
    vi.useRealTimers();

    // The settings table lists units with its own page query: one more.
    await router.navigate("/catalogue/parametres");
    await screen.findByRole("heading", {
      level: 1,
      name: "Catégories et unités",
    });
    await userEvent.click(screen.getByRole("tab", { name: "Unités" }));
    const table = await screen.findByRole("table", { name: "Unités" });
    await waitFor(() => expect(requests.of("/catalog/units")).toBe(2));

    // Editing a unit refreshes the active units table exactly once.
    const row = within(table).getByText("Kilogramme").closest("tr")!;
    await userEvent.click(within(row).getByRole("button", { name: "Actions" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Modifier" }),
    );
    const unitDialog = await screen.findByRole("dialog", {
      name: /Modifier Kilogramme/,
    });
    const name = within(unitDialog).getByLabelText(/^Nom/);
    await userEvent.clear(name);
    await userEvent.type(name, "Kilogrammes");
    await userEvent.click(
      within(unitDialog).getByRole("button", { name: "Enregistrer" }),
    );
    await waitFor(() =>
      expect(within(table).getByText("Kilogrammes")).toBeInTheDocument(),
    );
    expect(requests.of("/catalog/units")).toBe(3);

    // Back on the products page the invalidated reference is read again,
    // once; the products list, which prints unit symbols, is re-read once
    // too (AS-V2-27: exactly what the change touches).
    await router.navigate("/produits");
    await screen.findByRole("heading", { level: 1, name: "Produits" });
    await userEvent.click(
      screen.getByRole("button", { name: "Nouveau produit" }),
    );
    await screen.findByRole("dialog", { name: "Nouveau produit" });
    await waitFor(() => expect(requests.of("/catalog/units")).toBe(4));
    await waitFor(() => expect(requests.of("/catalog/products")).toBe(3));
  });
});
