import {
  InventoryItemType,
  InventoryMovementType,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { AppError } from "../../shared/appError.js";
import { runIdempotentCommand } from "../../shared/idempotency.js";

export interface InventoryActor {
  actorUserId: string;
  correlationId?: string;
}

export interface InventoryListParams {
  page: number;
  pageSize: number;
}

/// Reads and writes inside a posting command go through the transaction
/// client; everything else uses the shared client. Both expose the same model
/// delegates, so helpers accept either.
type DbClient = PrismaClient | Prisma.TransactionClient;

const mainLocationCode = "main";

export class InventoryService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async bootstrapInventoryData(): Promise<void> {
    await this.prisma.stockLocation.upsert({
      where: {
        code: mainLocationCode,
      },
      create: {
        code: mainLocationCode,
        name: "Stock principal",
        isMain: true,
      },
      update: {
        name: "Stock principal",
        isMain: true,
        isActive: true,
      },
    });
  }

  public async listMovements(params: InventoryListParams) {
    const [items, total] = await this.prisma.$transaction([
      // Item and unit names are snapshotted on the row, so no join is needed
      // to render the list.
      this.prisma.inventoryMovement.findMany({
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.inventoryMovement.count(),
    ]);

    return paginated(items, total, params);
  }

  public async listBalances() {
    const [productBalances, rawMaterialBalances] =
      await this.prisma.$transaction([
        this.prisma.inventoryMovement.groupBy({
          by: ["productId", "unitId"],
          where: {
            productId: {
              not: null,
            },
          },
          orderBy: [{ productId: "asc" }, { unitId: "asc" }],
          _sum: {
            quantityDelta: true,
          },
        }),
        this.prisma.inventoryMovement.groupBy({
          by: ["rawMaterialId", "unitId"],
          where: {
            rawMaterialId: {
              not: null,
            },
          },
          orderBy: [{ rawMaterialId: "asc" }, { unitId: "asc" }],
          _sum: {
            quantityDelta: true,
          },
        }),
      ]);

    const products = await this.prisma.product.findMany({
      where: {
        id: {
          in: productBalances
            .map((item) => item.productId)
            .filter((id): id is string => Boolean(id)),
        },
      },
      include: {
        baseUnit: true,
      },
    });
    const rawMaterials = await this.prisma.rawMaterial.findMany({
      where: {
        id: {
          in: rawMaterialBalances
            .map((item) => item.rawMaterialId)
            .filter((id): id is string => Boolean(id)),
        },
      },
      include: {
        baseUnit: true,
      },
    });

    return [
      ...productBalances.map((balance) => {
        const product = products.find((item) => item.id === balance.productId);
        const quantity = balance._sum?.quantityDelta?.toString() ?? "0";
        return {
          itemType: InventoryItemType.PRODUCT,
          itemId: balance.productId,
          itemName: product?.name ?? "Produit",
          unitName: product?.baseUnit.name ?? "Unité",
          quantity,
          isNegative: Number(quantity) < 0,
        };
      }),
      ...rawMaterialBalances.map((balance) => {
        const rawMaterial = rawMaterials.find(
          (item) => item.id === balance.rawMaterialId,
        );
        const quantity = balance._sum?.quantityDelta?.toString() ?? "0";
        return {
          itemType: InventoryItemType.RAW_MATERIAL,
          itemId: balance.rawMaterialId,
          itemName: rawMaterial?.name ?? "Matière première",
          unitName: rawMaterial?.baseUnit.name ?? "Unité",
          quantity,
          isNegative: Number(quantity) < 0,
        };
      }),
    ].sort((left, right) => left.itemName.localeCompare(right.itemName));
  }

  public async postOpeningStock(
    params: {
      idempotencyKey: string;
      itemType: InventoryItemType;
      itemId: string;
      quantity: string;
      reason: string;
    },
    actor: InventoryActor,
  ) {
    const quantity = toPositiveDecimalString(params.quantity);
    return runIdempotentCommand({
      prisma: this.prisma,
      scope: "inventory.opening_stock",
      key: params.idempotencyKey,
      payload: { ...params, quantity },
      execute: async (tx) => {
        const movement = await this.createMovement(tx, {
          itemType: params.itemType,
          itemId: params.itemId,
          quantityDelta: quantity,
          movementType: InventoryMovementType.OPENING_STOCK,
          sourceType: "OPENING_STOCK",
          reason: requireReason(params.reason),
          actor,
        });

        return { movement };
      },
    });
  }

  public async postAdjustment(
    params: {
      idempotencyKey: string;
      itemType: InventoryItemType;
      itemId: string;
      quantityDelta: string;
      reason: string;
    },
    actor: InventoryActor,
  ) {
    const quantityDelta = toNonZeroDecimalString(params.quantityDelta);
    return runIdempotentCommand({
      prisma: this.prisma,
      scope: "inventory.adjustment",
      key: params.idempotencyKey,
      payload: { ...params, quantityDelta },
      execute: async (tx) => {
        const movement = await this.createMovement(tx, {
          itemType: params.itemType,
          itemId: params.itemId,
          quantityDelta,
          movementType: quantityDelta.startsWith("-")
            ? InventoryMovementType.STOCK_ADJUSTMENT_DECREASE
            : InventoryMovementType.STOCK_ADJUSTMENT_INCREASE,
          sourceType: "STOCK_ADJUSTMENT",
          reason: requireReason(params.reason),
          actor,
        });

        return { movement };
      },
    });
  }

  private async createMovement(
    db: DbClient,
    params: {
      itemType: InventoryItemType;
      itemId: string;
      quantityDelta: string;
      movementType: InventoryMovementType;
      sourceType: string;
      reason: string;
      actor: InventoryActor;
    },
  ) {
    const [location, item] = await Promise.all([
      findMainLocation(db),
      findInventoryItem(db, params.itemType, params.itemId),
    ]);

    const movement = await db.inventoryMovement.create({
      data: {
        locationId: location.id,
        itemType: params.itemType,
        productId:
          params.itemType === InventoryItemType.PRODUCT ? params.itemId : null,
        rawMaterialId:
          params.itemType === InventoryItemType.RAW_MATERIAL
            ? params.itemId
            : null,
        unitId: item.unitId,
        movementType: params.movementType,
        quantityDelta: params.quantityDelta,
        itemNameSnapshot: item.name,
        unitNameSnapshot: item.unitName,
        sourceType: params.sourceType,
        reason: params.reason,
        actorUserId: params.actor.actorUserId,
        correlationId: params.actor.correlationId,
      },
      include: {
        location: true,
        product: true,
        rawMaterial: true,
        unit: true,
      },
    });

    await db.auditEvent.create({
      data: {
        actorUserId: params.actor.actorUserId,
        action: "inventory.movement.create",
        entity: "inventory_movement",
        targetId: movement.id,
        correlationId: params.actor.correlationId,
        after: movement,
      },
    });

    return movement;
  }
}

async function findMainLocation(db: DbClient) {
  const location = await db.stockLocation.findUnique({
    where: {
      code: mainLocationCode,
    },
  });

  if (!location) {
    throw new AppError({
      statusCode: 500,
      code: "MAIN_STOCK_LOCATION_MISSING",
      message: "Le stock principal est introuvable.",
    });
  }

  return location;
}

async function findInventoryItem(
  db: DbClient,
  itemType: InventoryItemType,
  itemId: string,
) {
  if (itemType === InventoryItemType.PRODUCT) {
    const product = await db.product.findUnique({
      where: {
        id: itemId,
      },
      include: {
        baseUnit: true,
      },
    });

    if (!product || !product.isActive || !product.isStockable) {
      throw new AppError({
        statusCode: 400,
        code: "STOCKABLE_PRODUCT_REQUIRED",
        message: "Un produit stockable actif est requis.",
      });
    }

    return {
      name: product.name,
      unitId: product.baseUnitId,
      unitName: product.baseUnit.name,
    };
  }

  const rawMaterial = await db.rawMaterial.findUnique({
    where: {
      id: itemId,
    },
    include: {
      baseUnit: true,
    },
  });

  if (!rawMaterial || !rawMaterial.isActive) {
    throw new AppError({
      statusCode: 400,
      code: "ACTIVE_RAW_MATERIAL_REQUIRED",
      message: "Une matière première active est requise.",
    });
  }

  return {
    name: rawMaterial.name,
    unitId: rawMaterial.baseUnitId,
    unitName: rawMaterial.baseUnit.name,
  };
}

function toPositiveDecimalString(value: string): string {
  const normalized = toNonZeroDecimalString(value);

  if (normalized.startsWith("-")) {
    throw new AppError({
      statusCode: 400,
      code: "POSITIVE_QUANTITY_REQUIRED",
      message: "La quantité doit être positive.",
    });
  }

  return normalized;
}

function toNonZeroDecimalString(value: string): string {
  const trimmed = value.trim();

  if (!/^-?\d+(\.\d{1,6})?$/.test(trimmed) || Number(trimmed) === 0) {
    throw new AppError({
      statusCode: 400,
      code: "NON_ZERO_QUANTITY_REQUIRED",
      message: "La quantité doit être différente de zéro.",
    });
  }

  return trimmed;
}

function requireReason(value: string): string {
  const reason = value.trim();

  if (reason.length < 3) {
    throw new AppError({
      statusCode: 400,
      code: "REASON_REQUIRED",
      message: "Une raison est requise.",
    });
  }

  return reason;
}

function paginated<TItem>(
  items: TItem[],
  total: number,
  params: InventoryListParams,
) {
  return {
    items,
    page: params.page,
    pageSize: params.pageSize,
    total,
    pageCount: Math.ceil(total / params.pageSize),
  };
}
