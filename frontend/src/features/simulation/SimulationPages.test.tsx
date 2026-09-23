import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router-dom";
import { beforeAll, describe, expect, it } from "vitest";
import { AppProviders, createQueryClient } from "../../app/providers";
import { createTestRouter } from "../../app/router";
import { makeUser } from "../../test/factories/user";
import { authHandlers } from "../../test/msw/handlers/auth";
import {
  makeSimulationStore,
  simulationHandlers,
} from "../../test/msw/handlers/simulation";
import { server } from "../../test/msw/server";
import { mockViewport } from "../../test/viewport";
import { simulationTotals } from "./simulation.schemas";

const planner = makeUser({
  effectivePermissions: [
    "simulations.view",
    "simulations.create",
    "simulations.update",
    "simulations.delete",
    "raw_materials.view",
    "products.view",
    "units.view",
    "inventory.view",
  ],
});

function renderAt(path: string, width = 1280) {
  mockViewport(width);
  server.use(...authHandlers(planner));
  const router = createTestRouter([path]);
  render(
    <AppProviders client={createQueryClient({ retry: false })}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}

describe("Simulations", () => {
  beforeAll(async () => {
    await Promise.all([
      import("./pages/SimulationsPage"),
      import("./pages/SimulationEditorPage"),
      import("./pages/SimulationDetailPage"),
    ]);
  });

  // AS-018: 6,350 TND of ingredients for 50 pieces is 0,127 TND per piece.
  it("applies the documented formulas", () => {
    const totals = simulationTotals(
      [
        { enteredQuantity: "3", factorToBase: "1", unitPriceTnd: "1.800" },
        { enteredQuantity: "0.1", factorToBase: "1", unitPriceTnd: "9" },
        { enteredQuantity: "0.05", factorToBase: "1", unitPriceTnd: "1" },
      ],
      "50",
    );
    expect(totals.total.toFixed(3)).toBe("6.350");
    expect(totals.perUnit.toFixed(3)).toBe("0.127");
    expect(
      simulationTotals(
        [{ enteredQuantity: "2", factorToBase: "50", unitPriceTnd: "1.2" }],
        "100",
      ).total.toFixed(3),
    ).toBe("120.000");
  });

  it("creates a simulation with a raw material and a free ingredient and shows the unit cost", async () => {
    const store = makeSimulationStore();
    server.use(...simulationHandlers(store));
    renderAt("/simulations/nouvelle");

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Nouvelle simulation",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Une simulation n'a aucun effet sur le stock ni la comptabilité.",
      )[0],
    ).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/^Nom/), "Baguette tradition");
    await userEvent.type(
      screen.getByRole("textbox", { name: /Quantité produite/ }),
      "50",
    );
    await userEvent.click(
      screen.getByRole("combobox", { name: "Unité produite" }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "Pièce" }));

    await userEvent.click(
      screen.getByRole("combobox", { name: "Matière première 1" }),
    );
    await userEvent.type(
      screen.getByPlaceholderText("Nom de l'article"),
      "farine",
    );
    await userEvent.click(await screen.findByText(/Farine T55/));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Quantité 1" }),
      "3",
    );
    const price = screen.getByRole("textbox", { name: "Prix unitaire 1" });
    await userEvent.clear(price);
    await userEvent.type(price, "1,8");
    expect(screen.getByText("Coût 5,400 TND")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Ajouter un ingrédient" }),
    );
    await userEvent.click(
      screen.getAllByRole("radio", {
        name: "Ingrédient libre",
      })[1] as HTMLElement,
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Ingrédient 2" }),
      "Levure",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Quantité 2" }),
      "0,1",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "Prix unitaire 2" }),
      "9",
    );
    expect(screen.getByText("Coût 0,900 TND")).toBeInTheDocument();
    expect(
      screen.getByText("Coût unitaire (par pièce)").parentElement,
    ).toHaveTextContent("0,126 TND");

    await userEvent.click(
      screen.getByRole("button", { name: "Enregistrer la simulation" }),
    );
    expect(
      (await screen.findAllByText("Simulation enregistrée"))[0],
    ).toBeInTheDocument();
    expect(store.simulations[0]).toMatchObject({
      name: "Baguette tradition",
      totalIngredientCostTnd: "6.300",
      costPerOutputUnitTnd: "0.126",
    });
    expect(store.simulations[0]?.ingredients[0]).toMatchObject({
      rawMaterialId: "raw-1",
      lineCostTnd: "5.400",
    });
    expect(store.simulations[0]?.ingredients[1]).toMatchObject({
      rawMaterialId: null,
      ingredientName: "Levure",
    });
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Baguette tradition",
      }),
    ).toBeInTheDocument();
  }, 20_000);

  it("shows a saved scenario at 0,127 per piece, duplicates and deletes it", async () => {
    const store = makeSimulationStore();
    server.use(...simulationHandlers(store));
    renderAt("/simulations/sim-1", 360);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Baguette tradition",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Coût unitaire (par pièce)").parentElement,
    ).toHaveTextContent("0,127 TND");
    expect(
      screen.getByText("Coût des ingrédients").parentElement,
    ).toHaveTextContent("6,350 TND");
    await userEvent.click(screen.getByRole("button", { name: "Dupliquer" }));
    expect(
      (await screen.findAllByText("Simulation dupliquée"))[0],
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Baguette tradition (copie)",
      }),
    ).toBeInTheDocument();
    expect(store.simulations).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: /Supprimer/,
    });
    expect(dialog).toHaveTextContent(
      "Aucun stock ni aucune écriture n'est concerné.",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Supprimer" }),
    );
    await waitFor(() => expect(store.simulations).toHaveLength(1));
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Simulation de coût",
      }),
    ).toBeInTheDocument();
  });
});
