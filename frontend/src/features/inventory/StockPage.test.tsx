import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import { makeUser } from "../../test/factories/user";
import { authHandlers } from "../../test/msw/handlers/auth";
import {
  inventoryHandlers,
  makeInventoryStore,
} from "../../test/msw/handlers/inventory";
import { server } from "../../test/msw/server";
import { mockViewport } from "../../test/viewport";

const manager = makeUser({
  effectivePermissions: [
    "inventory.view",
    "inventory.movements.view",
    "inventory.adjust",
    "inventory.opening_stock",
    "products.view",
    "raw_materials.view",
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

describe("Stock", () => {
  beforeAll(async () => {
    await Promise.all([
      import("./pages/StockPage"),
      import("./pages/MovementsPage"),
    ]);
  });

  it("shows balances, the negative banner and the negative-only filter", async () => {
    renderAt("/stock");

    expect(
      await screen.findByText(/1 article en stock négatif/),
    ).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Stock" });
    expect(within(table).getByText("Pain complet")).toBeInTheDocument();
    expect(within(table).getByText(/stock négatif/)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("radio", { name: "Négatifs seulement" }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("table", { name: "Stock" })).queryByText(
          "Pain complet",
        ),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(screen.getByRole("table", { name: "Stock" })).getByText(
        "Farine T55",
      ),
    ).toBeInTheDocument();
  });

  // AS-V2-14 on a phone: adjust −2 with a reason, from the item picker.
  it("posts an adjustment through the picker, the direction and the impact confirmation", async () => {
    const store = makeInventoryStore();
    server.use(...inventoryHandlers(store));
    renderAt("/stock", 360);

    await userEvent.click(
      await screen.findByRole("button", { name: "Ajustement" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Ajustement de stock",
    });
    await userEvent.click(
      within(dialog).getByRole("combobox", { name: "Article" }),
    );
    await userEvent.type(
      screen.getByPlaceholderText("Nom de l'article"),
      "pain",
    );
    await userEvent.click(await screen.findByText(/stock actuel 18/));
    expect(within(dialog).getByRole("radio", { name: "Sortie" })).toBeChecked();
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "Quantité" }),
      "2",
    );
    await userEvent.type(within(dialog).getByLabelText(/Motif/), "Casse");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Suivant" }),
    );

    const confirm = await screen.findByRole("alertdialog", {
      name: "Ajustement de stock",
    });
    expect(confirm).toHaveTextContent("passera de 18 pièce à 16 pièce");
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Valider" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByText("Ajustement enregistré"),
    ).toBeInTheDocument();
    expect(store.movements[0]).toMatchObject({
      quantityDelta: "-2",
      reason: "Casse",
      movementType: "STOCK_ADJUSTMENT_DECREASE",
    });
    expect(store.balances[0]?.quantity).toBe("16");
  });

  it("lists movements with French type labels and signed quantities", async () => {
    renderAt("/stock/mouvements");

    const table = await screen.findByRole("table", {
      name: "Mouvements de stock",
    });
    expect(within(table).getByText("Stock d'ouverture")).toBeInTheDocument();
    expect(within(table).getByText("Ajustement (sortie)")).toBeInTheDocument();
    expect(within(table).getByText(/^\+20/)).toBeInTheDocument();
    expect(within(table).getByText(/^−2/)).toBeInTheDocument();
    expect(within(table).getByText(/Ajustement · Casse/)).toBeInTheDocument();
    expect(within(table).getAllByText("Salma Ben Ali").length).toBeGreaterThan(
      0,
    );
    expect(table.textContent).not.toMatch(/movement-|product-/);
  });
});
