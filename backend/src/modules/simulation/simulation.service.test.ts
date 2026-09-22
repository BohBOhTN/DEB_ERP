import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { SimulationService } from "./simulation.service.js";

describe("SimulationService", () => {
  // AS-018: 6.350 TND of ingredients over 50 pieces shows 0.127 TND per piece
  // and changes no operational stock or balance. This is the worked example
  // from section 16.3.
  it("calculates the documented example and touches nothing operational", async () => {
    const { service, prisma } = makeService();

    const result = await service.createSimulation(
      {
        name: "Baguette standard",
        outputQuantity: "50",
        outputUnitId: "unit-piece",
        ingredients: [
          {
            rawMaterialId: "raw-flour",
            enteredQuantity: "3",
            enteredUnitId: "unit-kg",
            unitPriceTnd: "1.800",
            priceBasisUnitId: "unit-kg",
          },
          {
            ingredientName: "Levure",
            enteredQuantity: "0.1",
            enteredUnitId: "unit-kg",
            unitPriceTnd: "9.000",
            priceBasisUnitId: "unit-kg",
          },
          {
            ingredientName: "Sel",
            enteredQuantity: "0.05",
            enteredUnitId: "unit-kg",
            unitPriceTnd: "1.000",
            priceBasisUnitId: "unit-kg",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    expect(result.simulation.totalIngredientCostTnd).toBe("6.350");
    expect(result.simulation.costPerOutputUnitTnd).toBe("0.127");
    expect(
      result.simulation.ingredients.map((line) => line.lineCostTnd),
    ).toEqual(["5.400", "0.900", "0.050"]);

    // SIM-003: zero operational effect.
    expect(prisma.store.inventoryMovements).toHaveLength(0);
    expect(prisma.store.customerLedgerEntries).toHaveLength(0);
    expect(prisma.store.supplierLedgerEntries).toHaveLength(0);
    expect(prisma.store.expenses).toHaveLength(0);
    expect(prisma.store.sales).toHaveLength(0);
  });

  // Section 16.3: when units differ the entered quantity converts to the price
  // basis before costing.
  it("converts to the price basis unit using the raw material conversion", async () => {
    const { service } = makeService();

    const result = await service.createSimulation(
      {
        name: "Sac de farine",
        outputQuantity: "10",
        outputUnitId: "unit-piece",
        ingredients: [
          {
            rawMaterialId: "raw-flour",
            // One sack is 25 kg and flour is priced per kg.
            enteredQuantity: "2",
            enteredUnitId: "unit-sack",
            unitPriceTnd: "1.800",
            priceBasisUnitId: "unit-kg",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    expect(result.simulation.ingredients[0]).toMatchObject({
      conversionFactorToBase: "25.000000",
      baseQuantity: "50.000000",
      lineCostTnd: "90.000",
    });
    expect(result.simulation.costPerOutputUnitTnd).toBe("9.000");
  });

  it("accepts an explicit conversion for a free-text ingredient", async () => {
    const { service } = makeService();

    const result = await service.createSimulation(
      {
        name: "Ingredient libre",
        outputQuantity: "10",
        outputUnitId: "unit-piece",
        ingredients: [
          {
            ingredientName: "Ameliorant",
            enteredQuantity: "2",
            enteredUnitId: "unit-sack",
            unitPriceTnd: "1.000",
            priceBasisUnitId: "unit-kg",
            conversionFactorToBase: "25",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    expect(result.simulation.ingredients[0].baseQuantity).toBe("50.000000");
    expect(result.simulation.totalIngredientCostTnd).toBe("50.000");
  });

  it("rejects differing units with no conversion available", async () => {
    const { service } = makeService();

    await expect(
      service.createSimulation(
        {
          name: "Sans conversion",
          outputQuantity: "10",
          outputUnitId: "unit-piece",
          ingredients: [
            {
              ingredientName: "Ameliorant",
              enteredQuantity: "2",
              enteredUnitId: "unit-sack",
              unitPriceTnd: "1.000",
              priceBasisUnitId: "unit-kg",
            },
          ],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "SIMULATION_CONVERSION_REQUIRED",
    });
  });

  it("rejects a zero output quantity so cost per product never divides by zero", async () => {
    const { service } = makeService();

    await expect(
      service.createSimulation(
        {
          name: "Sortie nulle",
          outputQuantity: "0",
          outputUnitId: "unit-piece",
          ingredients: [
            {
              ingredientName: "Sel",
              enteredQuantity: "1",
              enteredUnitId: "unit-kg",
              unitPriceTnd: "1.000",
              priceBasisUnitId: "unit-kg",
            },
          ],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "SIMULATION_OUTPUT_REQUIRED",
    });
  });

  it("rejects a simulation with no ingredient", async () => {
    const { service } = makeService();

    await expect(
      service.createSimulation(
        {
          name: "Vide",
          outputQuantity: "10",
          outputUnitId: "unit-piece",
          ingredients: [],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "SIMULATION_INGREDIENTS_REQUIRED",
    });
  });

  it("rejects a non-positive ingredient quantity", async () => {
    const { service } = makeService();

    await expect(
      service.createSimulation(
        {
          name: "Quantite nulle",
          outputQuantity: "10",
          outputUnitId: "unit-piece",
          ingredients: [
            {
              ingredientName: "Sel",
              enteredQuantity: "0",
              enteredUnitId: "unit-kg",
              unitPriceTnd: "1.000",
              priceBasisUnitId: "unit-kg",
            },
          ],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "SIMULATION_QUANTITY_REQUIRED",
    });
  });

  // SIM-006: a saved scenario keeps the values entered at the time.
  it("keeps snapshotted values when the raw material price basis changes later", async () => {
    const { service, prisma } = makeService();
    const created = await service.createSimulation(
      {
        name: "Baguette standard",
        outputQuantity: "50",
        outputUnitId: "unit-piece",
        ingredients: [
          {
            rawMaterialId: "raw-flour",
            enteredQuantity: "3",
            enteredUnitId: "unit-kg",
            unitPriceTnd: "1.800",
            priceBasisUnitId: "unit-kg",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    // The catalogue changes after the fact.
    prisma.store.rawMaterials[0].name = "Farine T65 renommee";
    prisma.store.units[1].name = "Kilogramme renomme";

    const reloaded = await service.getSimulation(created.simulation.id);

    expect(reloaded.ingredients[0]).toMatchObject({
      ingredientName: "Farine",
      enteredUnitNameSnapshot: "Kg",
      unitPriceTnd: "1.800",
    });
  });

  // SIM-005: duplicate copies the snapshot rather than re-pricing.
  it("duplicates a simulation with its snapshotted values", async () => {
    const { service, prisma } = makeService();
    const created = await service.createSimulation(
      {
        name: "Baguette standard",
        outputQuantity: "50",
        outputUnitId: "unit-piece",
        ingredients: [
          {
            ingredientName: "Farine",
            enteredQuantity: "3",
            enteredUnitId: "unit-kg",
            unitPriceTnd: "1.800",
            priceBasisUnitId: "unit-kg",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    const duplicated = await service.duplicateSimulation(
      created.simulation.id,
      {},
      { actorUserId: "user-1" },
    );

    expect(duplicated.simulation.name).toBe("Baguette standard (copie)");
    expect(duplicated.simulation.totalIngredientCostTnd).toBe("5.400");
    expect(duplicated.simulation.id).not.toBe(created.simulation.id);
    expect(prisma.store.costSimulations).toHaveLength(2);
  });

  // SIM-005: a planning draft has no operational effect, so it may be deleted.
  it("deletes a simulation and its ingredients", async () => {
    const { service, prisma } = makeService();
    const created = await service.createSimulation(
      {
        name: "A supprimer",
        outputQuantity: "10",
        outputUnitId: "unit-piece",
        ingredients: [
          {
            ingredientName: "Sel",
            enteredQuantity: "1",
            enteredUnitId: "unit-kg",
            unitPriceTnd: "1.000",
            priceBasisUnitId: "unit-kg",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    await service.deleteSimulation(created.simulation.id, {
      actorUserId: "user-1",
    });

    expect(prisma.store.costSimulations).toHaveLength(0);
    expect(prisma.store.costSimulationIngredients).toHaveLength(0);
    expect(prisma.store.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "simulation.delete" }),
      ]),
    );
  });

  it("rejects a stale version on update", async () => {
    const { service } = makeService();
    const created = await service.createSimulation(
      {
        name: "Baguette standard",
        outputQuantity: "50",
        outputUnitId: "unit-piece",
        ingredients: [
          {
            ingredientName: "Farine",
            enteredQuantity: "3",
            enteredUnitId: "unit-kg",
            unitPriceTnd: "1.800",
            priceBasisUnitId: "unit-kg",
          },
        ],
      },
      { actorUserId: "user-1" },
    );

    await expect(
      service.updateSimulation(
        created.simulation.id,
        {
          version: created.simulation.version + 3,
          name: "Renommee",
          outputQuantity: "50",
          outputUnitId: "unit-piece",
          ingredients: [
            {
              ingredientName: "Farine",
              enteredQuantity: "3",
              enteredUnitId: "unit-kg",
              unitPriceTnd: "1.800",
              priceBasisUnitId: "unit-kg",
            },
          ],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });
  });
});

function makeService() {
  const prisma = new SimulationPrismaDouble();
  const service = new SimulationService(prisma as unknown as PrismaClient);

  return { prisma, service };
}

type Row = Record<string, unknown>;

interface SimulationStore {
  units: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
  rawMaterials: Array<{
    id: string;
    name: string;
    baseUnitId: string;
    conversions: Array<{
      unitId: string;
      factorToBase: string;
      isActive: boolean;
    }>;
  }>;
  costSimulations: Row[];
  costSimulationIngredients: Row[];
  auditEvents: Row[];
  /// Operational tables the simulation must never touch.
  inventoryMovements: Row[];
  customerLedgerEntries: Row[];
  supplierLedgerEntries: Row[];
  expenses: Row[];
  sales: Row[];
}

class SimulationPrismaDouble {
  public store = createSimulationStore();

  public readonly costSimulation = {
    findUnique: async (args: { where: { id: string } }) => {
      const simulation = this.store.costSimulations.find(
        (item) => item.id === args.where.id,
      );

      return simulation ? hydrate(this.store, simulation) : null;
    },
  };

  public async $transaction<TResult>(
    action:
      | Array<Promise<unknown>>
      | ((tx: ReturnType<typeof makeTransactionClient>) => Promise<TResult>),
  ): Promise<TResult> {
    if (Array.isArray(action)) {
      return (await Promise.all(action)) as TResult;
    }

    const staged = structuredClone(this.store) as SimulationStore;
    const result = await action(makeTransactionClient(staged));
    this.store = staged;
    return result;
  }
}

function createSimulationStore(): SimulationStore {
  return {
    units: [
      { id: "unit-piece", name: "Piece" },
      { id: "unit-kg", name: "Kg" },
      { id: "unit-sack", name: "Sac" },
    ],
    products: [{ id: "product-1", name: "Baguette" }],
    rawMaterials: [
      {
        id: "raw-flour",
        name: "Farine",
        baseUnitId: "unit-kg",
        conversions: [
          { unitId: "unit-sack", factorToBase: "25", isActive: true },
        ],
      },
    ],
    costSimulations: [],
    costSimulationIngredients: [],
    auditEvents: [],
    inventoryMovements: [],
    customerLedgerEntries: [],
    supplierLedgerEntries: [],
    expenses: [],
    sales: [],
  };
}

function hydrate(store: SimulationStore, simulation: Row) {
  return {
    ...simulation,
    targetProduct:
      store.products.find((item) => item.id === simulation.targetProductId) ??
      null,
    outputUnit:
      store.units.find((item) => item.id === simulation.outputUnitId) ?? null,
    ingredients: store.costSimulationIngredients
      .filter((line) => line.simulationId === simulation.id)
      .sort((left, right) => Number(left.position) - Number(right.position)),
  };
}

function makeTransactionClient(store: SimulationStore) {
  return {
    unit: {
      findMany: async (args: { where: { id: { in: string[] } } }) =>
        store.units.filter((unit) => args.where.id.in.includes(unit.id)),
    },
    product: {
      findUnique: async (args: { where: { id: string } }) =>
        store.products.find((item) => item.id === args.where.id) ?? null,
    },
    rawMaterial: {
      findMany: async (args: { where: { id: { in: string[] } } }) =>
        store.rawMaterials.filter((material) =>
          args.where.id.in.includes(material.id),
        ),
    },
    costSimulation: {
      findUnique: async (args: { where: { id: string } }) => {
        const simulation = store.costSimulations.find(
          (item) => item.id === args.where.id,
        );

        return simulation ? hydrate(store, simulation) : null;
      },
      findUniqueOrThrow: async (args: { where: { id: string } }) => {
        const simulation = store.costSimulations.find(
          (item) => item.id === args.where.id,
        );

        if (!simulation) {
          throw new Error("missing simulation");
        }

        return hydrate(store, simulation);
      },
      create: async (args: {
        data: Row & { ingredients: { createMany: { data: Row[] } } };
      }) => {
        const { ingredients, ...simulationData } = args.data;
        const simulation: Row = {
          id: `simulation-${store.costSimulations.length + 1}`,
          version: 1,
          ...simulationData,
        };
        store.costSimulations.push(simulation);
        ingredients.createMany.data.forEach((line) => {
          store.costSimulationIngredients.push({
            id: `ingredient-${store.costSimulationIngredients.length + 1}`,
            simulationId: simulation.id,
            ...line,
          });
        });

        return hydrate(store, simulation);
      },
      updateMany: async (args: { where: Row; data: Row }) => {
        const simulation = store.costSimulations.find(
          (item) => item.id === args.where.id,
        );

        if (
          !simulation ||
          (args.where.version !== undefined &&
            simulation.version !== args.where.version)
        ) {
          return { count: 0 };
        }

        for (const [key, value] of Object.entries(args.data)) {
          if (
            value &&
            typeof value === "object" &&
            "increment" in (value as Row)
          ) {
            simulation[key] =
              Number(simulation[key] ?? 0) +
              Number((value as { increment: number }).increment);
            continue;
          }

          simulation[key] = value;
        }

        return { count: 1 };
      },
      delete: async (args: { where: { id: string } }) => {
        store.costSimulations = store.costSimulations.filter(
          (item) => item.id !== args.where.id,
        );
        store.costSimulationIngredients =
          store.costSimulationIngredients.filter(
            (line) => line.simulationId !== args.where.id,
          );
      },
    },
    costSimulationIngredient: {
      deleteMany: async (args: { where: { simulationId: string } }) => {
        store.costSimulationIngredients =
          store.costSimulationIngredients.filter(
            (line) => line.simulationId !== args.where.simulationId,
          );
      },
      createMany: async (args: { data: Row[] }) => {
        args.data.forEach((line) => {
          store.costSimulationIngredients.push({
            id: `ingredient-${store.costSimulationIngredients.length + 1}`,
            ...line,
          });
        });
      },
    },
    auditEvent: {
      create: async (args: { data: Row }) => {
        store.auditEvents.push(args.data);
      },
    },
  };
}
