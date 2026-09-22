import { Prisma, type PrismaClient } from "@prisma/client";
import { AppError } from "../../shared/appError.js";
import { postingTransactionOptions } from "../../shared/idempotency.js";

export interface SimulationActor {
  actorUserId: string;
  correlationId?: string;
}

export interface SimulationIngredientInput {
  /// SIM-004: either an existing raw material or a free-text ingredient.
  rawMaterialId?: string;
  ingredientName?: string;
  enteredQuantity: string;
  enteredUnitId: string;
  unitPriceTnd: string;
  priceBasisUnitId: string;
  /// Required only when the entered unit differs from the price basis unit and
  /// no raw-material conversion covers it.
  conversionFactorToBase?: string;
}

export interface SimulationInput {
  name: string;
  targetProductId?: string;
  outputQuantity: string;
  outputUnitId: string;
  notes?: string;
  ingredients: SimulationIngredientInput[];
}

const simulationInclude = {
  targetProduct: true,
  outputUnit: true,
  ingredients: {
    orderBy: {
      position: "asc",
    },
  },
} satisfies Prisma.CostSimulationInclude;

export class SimulationService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listSimulations(params: { page: number; pageSize: number }) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.costSimulation.findMany({
        include: simulationInclude,
        orderBy: [{ updatedAt: "desc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.costSimulation.count(),
    ]);

    return paginated(items, total, params);
  }

  public async getSimulation(simulationId: string) {
    const simulation = await this.prisma.costSimulation.findUnique({
      where: {
        id: simulationId,
      },
      include: simulationInclude,
    });

    if (!simulation) {
      throw new AppError({
        statusCode: 404,
        code: "SIMULATION_NOT_FOUND",
        message: "Simulation introuvable.",
      });
    }

    return simulation;
  }

  /// SIM-001 and SIM-002. The whole command writes only to the two simulation
  /// tables, so saving a scenario can never touch stock, a party balance,
  /// revenue, a payment, or an expense.
  public async createSimulation(
    params: SimulationInput,
    actor: SimulationActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const resolved = await resolveSimulation(tx, params);
      const simulation = await tx.costSimulation.create({
        data: {
          name: resolved.name,
          targetProductId: resolved.targetProductId,
          targetProductNameSnapshot: resolved.targetProductNameSnapshot,
          outputQuantity: resolved.outputQuantity.toFixed(6),
          outputUnitId: resolved.outputUnitId,
          outputUnitNameSnapshot: resolved.outputUnitNameSnapshot,
          notes: emptyToNull(params.notes),
          totalIngredientCostTnd: resolved.totalIngredientCostTnd.toFixed(3),
          costPerOutputUnitTnd: resolved.costPerOutputUnitTnd.toFixed(3),
          createdByUserId: actor.actorUserId,
          updatedByUserId: actor.actorUserId,
          ingredients: {
            createMany: {
              data: resolved.ingredients,
            },
          },
        },
        include: simulationInclude,
      });

      await auditWithClient(tx, {
        actor,
        action: "simulation.create",
        entity: "cost_simulation",
        targetId: simulation.id,
        after: simulation,
      });

      return { simulation };
    }, postingTransactionOptions);
  }

  /// SIM-005: rename and update. Recalculates from the values submitted now,
  /// which are then snapshotted in their turn.
  public async updateSimulation(
    simulationId: string,
    params: SimulationInput & { version: number },
    actor: SimulationActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.costSimulation.findUnique({
        where: {
          id: simulationId,
        },
      });

      if (!existing) {
        throw new AppError({
          statusCode: 404,
          code: "SIMULATION_NOT_FOUND",
          message: "Simulation introuvable.",
        });
      }

      const resolved = await resolveSimulation(tx, params);
      const updated = await tx.costSimulation.updateMany({
        where: {
          id: simulationId,
          version: params.version,
        },
        data: {
          name: resolved.name,
          targetProductId: resolved.targetProductId,
          targetProductNameSnapshot: resolved.targetProductNameSnapshot,
          outputQuantity: resolved.outputQuantity.toFixed(6),
          outputUnitId: resolved.outputUnitId,
          outputUnitNameSnapshot: resolved.outputUnitNameSnapshot,
          notes: emptyToNull(params.notes),
          totalIngredientCostTnd: resolved.totalIngredientCostTnd.toFixed(3),
          costPerOutputUnitTnd: resolved.costPerOutputUnitTnd.toFixed(3),
          version: {
            increment: 1,
          },
          updatedByUserId: actor.actorUserId,
        },
      });

      if (updated.count === 0) {
        throw new AppError({
          statusCode: 409,
          code: "VERSION_CONFLICT",
          message: "Cette simulation a ete modifiee entre-temps.",
        });
      }

      await tx.costSimulationIngredient.deleteMany({
        where: {
          simulationId,
        },
      });
      await tx.costSimulationIngredient.createMany({
        data: resolved.ingredients.map((ingredient) => ({
          simulationId,
          ...ingredient,
        })),
      });

      const simulation = await tx.costSimulation.findUniqueOrThrow({
        where: {
          id: simulationId,
        },
        include: simulationInclude,
      });

      await auditWithClient(tx, {
        actor,
        action: "simulation.update",
        entity: "cost_simulation",
        targetId: simulationId,
        before: existing,
        after: simulation,
      });

      return { simulation };
    }, postingTransactionOptions);
  }

  /// SIM-005 and SIM-006: a duplicate copies the snapshotted values as they
  /// stand, so the copy is not re-priced from today's raw material data.
  public async duplicateSimulation(
    simulationId: string,
    params: { name?: string },
    actor: SimulationActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.costSimulation.findUnique({
        where: {
          id: simulationId,
        },
        include: {
          ingredients: {
            orderBy: {
              position: "asc",
            },
          },
        },
      });

      if (!source) {
        throw new AppError({
          statusCode: 404,
          code: "SIMULATION_NOT_FOUND",
          message: "Simulation introuvable.",
        });
      }

      const simulation = await tx.costSimulation.create({
        data: {
          name: params.name?.trim() || `${source.name} (copie)`,
          targetProductId: source.targetProductId,
          targetProductNameSnapshot: source.targetProductNameSnapshot,
          outputQuantity: source.outputQuantity,
          outputUnitId: source.outputUnitId,
          outputUnitNameSnapshot: source.outputUnitNameSnapshot,
          notes: source.notes,
          totalIngredientCostTnd: source.totalIngredientCostTnd,
          costPerOutputUnitTnd: source.costPerOutputUnitTnd,
          createdByUserId: actor.actorUserId,
          updatedByUserId: actor.actorUserId,
          ingredients: {
            createMany: {
              data: source.ingredients.map((ingredient) => ({
                rawMaterialId: ingredient.rawMaterialId,
                ingredientName: ingredient.ingredientName,
                enteredQuantity: ingredient.enteredQuantity,
                enteredUnitId: ingredient.enteredUnitId,
                conversionFactorToBase: ingredient.conversionFactorToBase,
                baseQuantity: ingredient.baseQuantity,
                unitPriceTnd: ingredient.unitPriceTnd,
                priceBasisUnitId: ingredient.priceBasisUnitId,
                lineCostTnd: ingredient.lineCostTnd,
                enteredUnitNameSnapshot: ingredient.enteredUnitNameSnapshot,
                priceBasisUnitNameSnapshot:
                  ingredient.priceBasisUnitNameSnapshot,
                position: ingredient.position,
              })),
            },
          },
        },
        include: simulationInclude,
      });

      await auditWithClient(tx, {
        actor,
        action: "simulation.duplicate",
        entity: "cost_simulation",
        targetId: simulation.id,
        after: simulation,
      });

      return { simulation };
    }, postingTransactionOptions);
  }

  /// SIM-005: a simulation is a draft with no operational effect, so unlike a
  /// posted document it may genuinely be deleted.
  public async deleteSimulation(simulationId: string, actor: SimulationActor) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.costSimulation.findUnique({
        where: {
          id: simulationId,
        },
        include: simulationInclude,
      });

      if (!existing) {
        throw new AppError({
          statusCode: 404,
          code: "SIMULATION_NOT_FOUND",
          message: "Simulation introuvable.",
        });
      }

      await tx.costSimulation.delete({
        where: {
          id: simulationId,
        },
      });

      await auditWithClient(tx, {
        actor,
        action: "simulation.delete",
        entity: "cost_simulation",
        targetId: simulationId,
        before: existing,
      });

      return { deleted: true };
    }, postingTransactionOptions);
  }
}

/// Applies section 16.3 in full: line costs, the total, and cost per final
/// product, with every validation the source of truth lists.
async function resolveSimulation(
  client: Prisma.TransactionClient,
  params: SimulationInput,
) {
  const name = params.name.trim();

  if (!name) {
    throw new AppError({
      statusCode: 400,
      code: "SIMULATION_NAME_REQUIRED",
      message: "Un nom de simulation est obligatoire.",
    });
  }

  if (params.ingredients.length === 0) {
    throw new AppError({
      statusCode: 400,
      code: "SIMULATION_INGREDIENTS_REQUIRED",
      message: "Ajoutez au moins un ingredient.",
    });
  }

  const outputQuantity = parsePositiveQuantity(
    params.outputQuantity,
    "SIMULATION_OUTPUT_REQUIRED",
    "La quantite produite doit etre superieure a zero.",
  );
  const unitIds = new Set<string>([params.outputUnitId]);

  for (const ingredient of params.ingredients) {
    unitIds.add(ingredient.enteredUnitId);
    unitIds.add(ingredient.priceBasisUnitId);
  }

  const units = await client.unit.findMany({
    where: {
      id: {
        in: [...unitIds],
      },
    },
  });
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const outputUnit = unitById.get(params.outputUnitId);

  if (!outputUnit) {
    throw new AppError({
      statusCode: 400,
      code: "SIMULATION_UNIT_REQUIRED",
      message: "Chaque unite doit exister.",
    });
  }

  const rawMaterialIds = params.ingredients
    .map((ingredient) => ingredient.rawMaterialId)
    .filter((id): id is string => Boolean(id));
  const rawMaterials =
    rawMaterialIds.length > 0
      ? await client.rawMaterial.findMany({
          where: {
            id: {
              in: rawMaterialIds,
            },
          },
          include: {
            conversions: true,
          },
        })
      : [];
  const rawMaterialById = new Map(
    rawMaterials.map((material) => [material.id, material]),
  );

  let targetProductNameSnapshot: string | null = null;

  if (params.targetProductId) {
    const product = await client.product.findUnique({
      where: {
        id: params.targetProductId,
      },
    });

    if (!product) {
      throw new AppError({
        statusCode: 400,
        code: "SIMULATION_TARGET_PRODUCT_REQUIRED",
        message: "Le produit cible doit exister.",
      });
    }

    targetProductNameSnapshot = product.name;
  }

  const ingredients = params.ingredients.map((ingredient, index) => {
    const enteredUnit = unitById.get(ingredient.enteredUnitId);
    const priceBasisUnit = unitById.get(ingredient.priceBasisUnitId);

    if (!enteredUnit || !priceBasisUnit) {
      throw new AppError({
        statusCode: 400,
        code: "SIMULATION_UNIT_REQUIRED",
        message: "Chaque unite doit exister.",
      });
    }

    const rawMaterial = ingredient.rawMaterialId
      ? rawMaterialById.get(ingredient.rawMaterialId)
      : undefined;

    if (ingredient.rawMaterialId && !rawMaterial) {
      throw new AppError({
        statusCode: 400,
        code: "SIMULATION_RAW_MATERIAL_REQUIRED",
        message: "La matiere premiere doit exister.",
      });
    }

    const ingredientName =
      ingredient.ingredientName?.trim() || rawMaterial?.name || "";

    if (!ingredientName) {
      throw new AppError({
        statusCode: 400,
        code: "SIMULATION_INGREDIENT_NAME_REQUIRED",
        message: "Chaque ingredient doit avoir un nom.",
      });
    }

    const enteredQuantity = parsePositiveQuantity(
      ingredient.enteredQuantity,
      "SIMULATION_QUANTITY_REQUIRED",
      "La quantite d'un ingredient doit etre superieure a zero.",
    );
    const unitPriceTnd = parseNonNegativeMoney(ingredient.unitPriceTnd);
    const conversionFactorToBase = resolveConversionFactor({
      ingredient,
      rawMaterial,
    });
    const baseQuantity = enteredQuantity
      .mul(conversionFactorToBase)
      .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);

    return {
      rawMaterialId: ingredient.rawMaterialId ?? null,
      ingredientName,
      enteredQuantity: enteredQuantity.toFixed(6),
      enteredUnitId: ingredient.enteredUnitId,
      conversionFactorToBase: conversionFactorToBase.toFixed(6),
      baseQuantity: baseQuantity.toFixed(6),
      unitPriceTnd: unitPriceTnd.toFixed(3),
      priceBasisUnitId: ingredient.priceBasisUnitId,
      lineCostTnd: baseQuantity
        .mul(unitPriceTnd)
        .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP)
        .toFixed(3),
      enteredUnitNameSnapshot: enteredUnit.name,
      priceBasisUnitNameSnapshot: priceBasisUnit.name,
      position: index,
    };
  });
  const totalIngredientCostTnd = ingredients
    .reduce(
      (total, ingredient) => total.plus(ingredient.lineCostTnd),
      new Prisma.Decimal(0),
    )
    .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);

  return {
    name,
    targetProductId: params.targetProductId ?? null,
    targetProductNameSnapshot,
    outputQuantity,
    outputUnitId: params.outputUnitId,
    outputUnitNameSnapshot: outputUnit.name,
    ingredients,
    totalIngredientCostTnd,
    // Output quantity is proven positive above, so this never divides by zero.
    costPerOutputUnitTnd: totalIngredientCostTnd
      .div(outputQuantity)
      .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP),
  };
}

/// When the entered unit and the price basis agree the factor is one. When they
/// differ a conversion must exist: either the raw material declares it, or the
/// caller supplies it for a free-text ingredient.
function resolveConversionFactor(params: {
  ingredient: SimulationIngredientInput;
  rawMaterial?: {
    baseUnitId: string;
    conversions: Array<{
      unitId: string;
      factorToBase: Prisma.Decimal;
      isActive: boolean;
    }>;
  };
}): Prisma.Decimal {
  const { ingredient, rawMaterial } = params;

  if (ingredient.enteredUnitId === ingredient.priceBasisUnitId) {
    return new Prisma.Decimal(1);
  }

  if (ingredient.conversionFactorToBase !== undefined) {
    return parsePositiveQuantity(
      ingredient.conversionFactorToBase,
      "SIMULATION_CONVERSION_REQUIRED",
      "Le facteur de conversion doit etre superieur a zero.",
    );
  }

  const declared = rawMaterial?.conversions.find(
    (conversion) =>
      conversion.unitId === ingredient.enteredUnitId && conversion.isActive,
  );

  if (
    !declared ||
    !rawMaterial ||
    rawMaterial.baseUnitId !== ingredient.priceBasisUnitId
  ) {
    throw new AppError({
      statusCode: 400,
      code: "SIMULATION_CONVERSION_REQUIRED",
      message:
        "Une conversion est obligatoire lorsque l'unite saisie differe de l'unite de prix.",
    });
  }

  return new Prisma.Decimal(declared.factorToBase);
}

async function auditWithClient(
  client: Prisma.TransactionClient,
  params: {
    actor?: SimulationActor;
    action: string;
    entity: string;
    targetId?: string;
    before?: unknown;
    after?: unknown;
  },
) {
  await client.auditEvent.create({
    data: {
      actorUserId: params.actor?.actorUserId,
      action: params.action,
      entity: params.entity,
      targetId: params.targetId,
      correlationId: params.actor?.correlationId,
      before: params.before === undefined ? undefined : toJson(params.before),
      after: params.after === undefined ? undefined : toJson(params.after),
    },
  });
}

function parsePositiveQuantity(
  value: string,
  code: string,
  message: string,
): Prisma.Decimal {
  const decimal = new Prisma.Decimal(value);

  if (!decimal.greaterThan(0)) {
    throw new AppError({
      statusCode: 400,
      code,
      message,
    });
  }

  return decimal.toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
}

function parseNonNegativeMoney(value: string): Prisma.Decimal {
  const decimal = new Prisma.Decimal(value);

  if (decimal.lessThan(0)) {
    throw new AppError({
      statusCode: 400,
      code: "SIMULATION_PRICE_INVALID",
      message: "Le prix unitaire ne peut pas etre negatif.",
    });
  }

  return decimal.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function paginated<TItem>(
  items: TItem[],
  total: number,
  params: { page: number; pageSize: number },
) {
  return {
    items,
    page: params.page,
    pageSize: params.pageSize,
    total,
    pageCount: Math.ceil(total / params.pageSize),
  };
}
