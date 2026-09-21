import {
  InventoryItemType,
  InventoryMovementType,
  type PrismaClient,
} from "@prisma/client";
import { createHash } from "node:crypto";
import { AppError } from "../../shared/appError.js";

export interface InventoryActor {
  actorUserId: string;
  correlationId?: string;
}

export interface InventoryListParams {
  page: number;
  pageSize: number;
}

const mainLocationCode = "main";

export class InventoryService {
  public constructor(private prisma: PrismaClient) {}

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
      this.prisma.inventoryMovement.findMany({
        include: {
          location: true,
          product: true,
          rawMaterial: true,
          unit: true,
        },
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
          unitName: product?.baseUnit.name ?? "Unite",
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
          itemName: rawMaterial?.name ?? "Matiere premiere",
          unitName: rawMaterial?.baseUnit.name ?? "Unite",
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
    return this.runIdempotentCommand(
      "inventory.opening_stock",
      params.idempotencyKey,
      { ...params, quantity },
      async () => {
        const movement = await this.createMovement({
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
    );
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
    return this.runIdempotentCommand(
      "inventory.adjustment",
      params.idempotencyKey,
      { ...params, quantityDelta },
      async () => {
        const movement = await this.createMovement({
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
    );
  }

  private async createMovement(params: {
    itemType: InventoryItemType;
    itemId: string;
    quantityDelta: string;
    movementType: InventoryMovementType;
    sourceType: string;
    reason: string;
    actor: InventoryActor;
  }) {
    const [location, item] = await Promise.all([
      this.findMainLocation(),
      this.findInventoryItem(params.itemType, params.itemId),
    ]);

    const movement = await this.prisma.inventoryMovement.create({
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

    await this.audit({
      actor: params.actor,
      action: "inventory.movement.create",
      entity: "inventory_movement",
      targetId: movement.id,
      after: movement,
    });

    return movement;
  }

  private async runIdempotentCommand<TResponse>(
    scope: string,
    key: string,
    payload: unknown,
    action: () => Promise<TResponse>,
  ): Promise<TResponse> {
    if (!key.trim()) {
      throw new AppError({
        statusCode: 400,
        code: "IDEMPOTENCY_KEY_REQUIRED",
        message: "Une cle d'idempotence est requise.",
      });
    }

    const requestHash = hashPayload(payload);
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: {
        scope_key: {
          scope,
          key,
        },
      },
    });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new AppError({
          statusCode: 409,
          code: "IDEMPOTENCY_CONFLICT",
          message: "Cette cle a deja ete utilisee pour une autre demande.",
        });
      }

      if (existing.response) {
        return existing.response as TResponse;
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.idempotencyRecord.create({
        data: {
          scope,
          key,
          requestHash,
        },
      });

      const original = this.prisma;
      this.prisma = tx as unknown as PrismaClient;
      try {
        const response = await action();
        await tx.idempotencyRecord.update({
          where: {
            scope_key: {
              scope,
              key,
            },
          },
          data: {
            response: response as object,
          },
        });
        return response;
      } finally {
        this.prisma = original;
      }
    });
  }

  private async findMainLocation() {
    const location = await this.prisma.stockLocation.findUnique({
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

  private async findInventoryItem(itemType: InventoryItemType, itemId: string) {
    if (itemType === InventoryItemType.PRODUCT) {
      const product = await this.prisma.product.findUnique({
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

    const rawMaterial = await this.prisma.rawMaterial.findUnique({
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
        message: "Une matiere premiere active est requise.",
      });
    }

    return {
      name: rawMaterial.name,
      unitId: rawMaterial.baseUnitId,
      unitName: rawMaterial.baseUnit.name,
    };
  }

  private async audit(params: {
    actor: InventoryActor;
    action: string;
    entity: string;
    targetId: string;
    after: unknown;
  }) {
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: params.actor.actorUserId,
        action: params.action,
        entity: params.entity,
        targetId: params.targetId,
        correlationId: params.actor.correlationId,
        after: params.after ?? undefined,
      },
    });
  }
}

function toPositiveDecimalString(value: string): string {
  const normalized = toNonZeroDecimalString(value);

  if (normalized.startsWith("-")) {
    throw new AppError({
      statusCode: 400,
      code: "POSITIVE_QUANTITY_REQUIRED",
      message: "La quantite doit etre positive.",
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
      message: "La quantite doit etre differente de zero.",
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

function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
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
