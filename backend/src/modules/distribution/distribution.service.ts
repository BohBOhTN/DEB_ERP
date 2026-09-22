import {
  DistributorLedgerEntryType,
  InventoryItemType,
  InventoryMovementType,
  Prisma,
  SalePaymentState,
  SaleStatus,
  type PrismaClient,
} from "@prisma/client";
import { createHash } from "node:crypto";
import { AppError } from "../../shared/appError.js";
import { normalizeName } from "../catalog/catalog.service.js";

const mainLocationCode = "main";

export interface DistributionActor {
  actorUserId: string;
  correlationId?: string;
}

export interface DistributorListParams {
  search?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
}

export interface DistributorSaleLineInput {
  productId: string;
  quantity: string;
  /// DST-029 is open, so the price is entered per transaction and snapshotted
  /// rather than taken from a distributor price list.
  unitPriceTnd: string;
}

export class DistributionService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listDistributors(params: DistributorListParams) {
    const normalizedSearch = params.search
      ? normalizeName(params.search)
      : undefined;
    const where = {
      ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
      ...(normalizedSearch
        ? {
            OR: [
              {
                normalizedName: {
                  contains: normalizedSearch,
                  mode: "insensitive" as const,
                },
              },
              {
                phone: {
                  contains: params.search,
                  mode: "insensitive" as const,
                },
              },
              {
                taxIdentifier: {
                  contains: params.search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.distributor.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.distributor.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  public async createDistributor(
    params: {
      name: string;
      phone?: string;
      address?: string;
      taxIdentifier?: string;
      notes?: string;
    },
    actor: DistributionActor,
  ) {
    const normalizedName = normalizeName(params.name);
    await this.assertActiveDistributorNameAvailable(normalizedName);

    const distributor = await this.prisma.distributor.create({
      data: {
        name: params.name.trim(),
        normalizedName,
        phone: emptyToNull(params.phone),
        address: emptyToNull(params.address),
        taxIdentifier: emptyToNull(params.taxIdentifier),
        notes: emptyToNull(params.notes),
        createdByUserId: actor.actorUserId,
        updatedByUserId: actor.actorUserId,
      },
    });

    await this.audit({
      actor,
      action: "distributor.create",
      entity: "distributor",
      targetId: distributor.id,
      after: distributor,
    });

    return distributor;
  }

  public async updateDistributor(
    distributorId: string,
    params: {
      version: number;
      name?: string;
      phone?: string;
      address?: string;
      taxIdentifier?: string;
      notes?: string;
      isActive?: boolean;
    },
    actor: DistributionActor,
  ) {
    const existing = await this.findDistributorOrThrow(distributorId);
    const normalizedName =
      params.name !== undefined ? normalizeName(params.name) : undefined;

    if ((params.isActive ?? existing.isActive) && normalizedName) {
      await this.assertActiveDistributorNameAvailable(
        normalizedName,
        existing.id,
      );
    }

    const result = await this.prisma.distributor.updateMany({
      where: {
        id: distributorId,
        version: params.version,
      },
      data: {
        ...(params.name !== undefined
          ? { name: params.name.trim(), normalizedName }
          : {}),
        ...(params.phone !== undefined
          ? { phone: emptyToNull(params.phone) }
          : {}),
        ...(params.address !== undefined
          ? { address: emptyToNull(params.address) }
          : {}),
        ...(params.taxIdentifier !== undefined
          ? { taxIdentifier: emptyToNull(params.taxIdentifier) }
          : {}),
        ...(params.notes !== undefined
          ? { notes: emptyToNull(params.notes) }
          : {}),
        ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
        version: {
          increment: 1,
        },
        updatedByUserId: actor.actorUserId,
      },
    });

    assertVersionUpdated(result.count);
    const distributor = await this.findDistributorOrThrow(distributorId);

    await this.audit({
      actor,
      action: "distributor.update",
      entity: "distributor",
      targetId: distributor.id,
      before: existing,
      after: distributor,
    });

    return distributor;
  }

  /// DST-004 to DST-009. A direct sale is not consignment: stock leaves main
  /// immediately, the full amount is recognized once, and only the money
  /// actually received is recorded. Any remainder is distributor receivable.
  public async postDirectSale(
    params: {
      idempotencyKey: string;
      distributorId: string;
      soldAt: Date;
      paidAmountTnd?: string;
      notes?: string;
      lines: DistributorSaleLineInput[];
    },
    actor: DistributionActor,
  ) {
    const lines = normalizeSaleLines(params.lines);

    return this.runIdempotentCommand(
      `distributor_sale.post.${params.distributorId}`,
      params.idempotencyKey,
      {
        ...params,
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity.toFixed(6),
          unitPriceTnd: line.unitPriceTnd.toFixed(3),
        })),
      },
      async (tx) => {
        const distributor = await requireActiveDistributor(
          tx,
          params.distributorId,
        );
        const lineRows = await buildSaleLines(tx, lines);
        const totalTnd = sumDecimals(
          lineRows.map((line) => line.lineTotalTnd),
          3,
        );

        if (!totalTnd.greaterThan(0)) {
          throw new AppError({
            statusCode: 400,
            code: "DISTRIBUTOR_SALE_TOTAL_REQUIRED",
            message: "Le total de la vente doit etre superieur a zero.",
          });
        }

        const paidAmountTnd =
          params.paidAmountTnd === undefined
            ? totalTnd
            : parseNonNegativeMoney(params.paidAmountTnd);

        if (paidAmountTnd.greaterThan(totalTnd)) {
          throw new AppError({
            statusCode: 400,
            code: "DISTRIBUTOR_OVERPAYMENT_REJECTED",
            message: "Le paiement ne peut pas depasser le total de la vente.",
          });
        }

        const remainingDueTnd = totalTnd
          .minus(paidAmountTnd)
          .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
        const sale = await tx.distributorSale.create({
          data: {
            reference: await nextReference(
              tx,
              "distributor_sale_reference_seq",
              "VD",
            ),
            distributorId: distributor.id,
            status: SaleStatus.POSTED,
            paymentState: derivePaymentState(totalTnd, paidAmountTnd),
            soldAt: params.soldAt,
            totalTnd: totalTnd.toFixed(3),
            paidAmountTnd: paidAmountTnd.toFixed(3),
            remainingDueTnd: remainingDueTnd.toFixed(3),
            notes: emptyToNull(params.notes),
            postedAt: params.soldAt,
            postedByUserId: actor.actorUserId,
            correlationId: actor.correlationId,
            lines: {
              createMany: {
                data: lineRows.map((line) => ({
                  productId: line.productId,
                  unitId: line.unitId,
                  quantity: line.quantity.toFixed(6),
                  unitPriceTnd: line.unitPriceTnd.toFixed(3),
                  lineTotalTnd: line.lineTotalTnd.toFixed(3),
                  productNameSnapshot: line.productNameSnapshot,
                  unitNameSnapshot: line.unitNameSnapshot,
                })),
              },
            },
          },
        });

        // The full sale becomes receivable, then the money actually received
        // reduces it. This matches how a purchase records its payable.
        await tx.distributorLedgerEntry.create({
          data: {
            distributorId: distributor.id,
            saleId: sale.id,
            entryType: DistributorLedgerEntryType.SALE_RECEIVABLE,
            amountTnd: totalTnd.toFixed(3),
            occurredAt: params.soldAt,
            actorUserId: actor.actorUserId,
            correlationId: actor.correlationId,
          },
        });

        if (paidAmountTnd.greaterThan(0)) {
          const payment = await tx.distributorPayment.create({
            data: {
              distributorId: distributor.id,
              amountTnd: paidAmountTnd.toFixed(3),
              paidAt: params.soldAt,
              notes: emptyToNull(params.notes),
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
              allocations: {
                createMany: {
                  data: [
                    {
                      saleId: sale.id,
                      amountTnd: paidAmountTnd.toFixed(3),
                    },
                  ],
                },
              },
            },
          });

          await tx.distributorLedgerEntry.create({
            data: {
              distributorId: distributor.id,
              saleId: sale.id,
              paymentId: payment.id,
              entryType: DistributorLedgerEntryType.PAYMENT,
              amountTnd: paidAmountTnd.negated().toFixed(3),
              occurredAt: params.soldAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            },
          });
        }

        // DST-005: main stock decreases immediately for stockable products.
        await writeStockMovements(tx, {
          rows: lineRows.filter((line) => line.isStockable),
          movementType: InventoryMovementType.DISTRIBUTOR_DIRECT_SALE,
          sourceType: "DISTRIBUTOR_DIRECT_SALE",
          sourceId: sale.id,
          reason: `Vente directe ${sale.reference}`,
          occurredAt: params.soldAt,
          signedQuantity: (quantity) => quantity.negated(),
          actor,
        });

        const result = await tx.distributorSale.findUniqueOrThrow({
          where: {
            id: sale.id,
          },
          include: {
            distributor: true,
            lines: true,
          },
        });

        await auditWithClient(tx, {
          actor,
          action: "distributor_sale.post",
          entity: "distributor_sale",
          targetId: result.id,
          after: result,
        });

        return { sale: result };
      },
    );
  }

  private async runIdempotentCommand<TResponse>(
    scope: string,
    key: string,
    payload: unknown,
    action: (tx: Prisma.TransactionClient) => Promise<TResponse>,
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

      const response = await action(tx);
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
    });
  }

  private async findDistributorOrThrow(distributorId: string) {
    const distributor = await this.prisma.distributor.findUnique({
      where: {
        id: distributorId,
      },
    });

    if (!distributor) {
      throw new AppError({
        statusCode: 404,
        code: "DISTRIBUTOR_NOT_FOUND",
        message: "Distributeur introuvable.",
      });
    }

    return distributor;
  }

  private async assertActiveDistributorNameAvailable(
    normalizedName: string,
    excludingDistributorId?: string,
  ) {
    const existing = await this.prisma.distributor.findFirst({
      where: {
        normalizedName,
        isActive: true,
        ...(excludingDistributorId
          ? { id: { not: excludingDistributorId } }
          : {}),
      },
    });

    if (existing) {
      throw new AppError({
        statusCode: 409,
        code: "DISTRIBUTOR_NAME_EXISTS",
        message: "Un distributeur actif avec ce nom existe deja.",
      });
    }
  }

  private async audit(params: {
    actor?: DistributionActor;
    action: string;
    entity: string;
    targetId?: string;
    before?: unknown;
    after?: unknown;
  }) {
    await this.prisma.auditEvent.create({
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
}

interface SaleLineRow {
  productId: string;
  unitId: string;
  quantity: Prisma.Decimal;
  unitPriceTnd: Prisma.Decimal;
  lineTotalTnd: Prisma.Decimal;
  productNameSnapshot: string;
  unitNameSnapshot: string;
  isStockable: boolean;
}

function normalizeSaleLines(lines: DistributorSaleLineInput[]) {
  if (lines.length === 0) {
    throw new AppError({
      statusCode: 400,
      code: "DISTRIBUTOR_SALE_LINES_REQUIRED",
      message: "Ajoutez au moins une ligne a la vente.",
    });
  }

  const normalized = lines.map((line) => ({
    productId: line.productId,
    quantity: parsePositiveQuantity(line.quantity),
    unitPriceTnd: parseNonNegativeMoney(line.unitPriceTnd),
  }));

  if (findDuplicate(normalized.map((line) => line.productId))) {
    throw new AppError({
      statusCode: 400,
      code: "DUPLICATE_DISTRIBUTOR_SALE_LINE",
      message: "Un produit ne peut apparaitre qu'une seule fois.",
    });
  }

  return normalized;
}

/// DST-009: lines snapshot the applied price, quantity, unit, and total, so a
/// later catalogue change never rewrites a posted document.
async function buildSaleLines(
  client: Prisma.TransactionClient,
  lines: Array<{
    productId: string;
    quantity: Prisma.Decimal;
    unitPriceTnd: Prisma.Decimal;
  }>,
): Promise<SaleLineRow[]> {
  const products = await client.product.findMany({
    where: {
      id: {
        in: lines.map((line) => line.productId),
      },
    },
    include: {
      baseUnit: true,
    },
  });

  return lines.map((line) => {
    const product = products.find((item) => item.id === line.productId);

    if (!product || !product.isActive) {
      throw new AppError({
        statusCode: 400,
        code: "DISTRIBUTOR_PRODUCT_REQUIRED",
        message: "Chaque ligne doit viser un produit actif.",
      });
    }

    return {
      productId: product.id,
      unitId: product.baseUnitId,
      quantity: line.quantity,
      unitPriceTnd: line.unitPriceTnd,
      lineTotalTnd: line.quantity
        .mul(line.unitPriceTnd)
        .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP),
      productNameSnapshot: product.name,
      unitNameSnapshot: product.baseUnit.name,
      isStockable: product.isStockable,
    };
  });
}

async function writeStockMovements(
  client: Prisma.TransactionClient,
  params: {
    rows: Array<{
      productId: string;
      unitId: string;
      quantity: Prisma.Decimal;
      productNameSnapshot: string;
      unitNameSnapshot: string;
    }>;
    movementType: InventoryMovementType;
    sourceType: string;
    sourceId: string;
    reason: string;
    occurredAt: Date;
    signedQuantity: (quantity: Prisma.Decimal) => Prisma.Decimal;
    actor: DistributionActor;
  },
) {
  if (params.rows.length === 0) {
    return;
  }

  const location = await client.stockLocation.findUnique({
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

  await client.inventoryMovement.createMany({
    data: params.rows.map((row) => ({
      locationId: location.id,
      itemType: InventoryItemType.PRODUCT,
      productId: row.productId,
      unitId: row.unitId,
      movementType: params.movementType,
      quantityDelta: params.signedQuantity(row.quantity).toFixed(6),
      itemNameSnapshot: row.productNameSnapshot,
      unitNameSnapshot: row.unitNameSnapshot,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      reason: params.reason,
      occurredAt: params.occurredAt,
      actorUserId: params.actor.actorUserId,
      correlationId: params.actor.correlationId,
    })),
  });
}

async function requireActiveDistributor(
  client: Prisma.TransactionClient,
  distributorId: string,
) {
  const distributor = await client.distributor.findUnique({
    where: {
      id: distributorId,
    },
  });

  if (!distributor || !distributor.isActive) {
    throw new AppError({
      statusCode: 400,
      code: "ACTIVE_DISTRIBUTOR_REQUIRED",
      message: "Un distributeur actif est obligatoire.",
    });
  }

  return distributor;
}

async function nextReference(
  client: Prisma.TransactionClient,
  sequenceName: string,
  prefix: string,
) {
  const rows = await client.$queryRawUnsafe<Array<{ nextval: bigint }>>(
    `SELECT nextval('${sequenceName}')`,
  );
  const sequence = rows[0]?.nextval ?? BigInt(1);

  return `${prefix}-${sequence.toString().padStart(6, "0")}`;
}

async function auditWithClient(
  client: Prisma.TransactionClient,
  params: {
    actor?: DistributionActor;
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

function derivePaymentState(
  totalTnd: Prisma.Decimal,
  paidAmountTnd: Prisma.Decimal,
): SalePaymentState {
  if (paidAmountTnd.equals(totalTnd)) {
    return SalePaymentState.PAID;
  }

  if (paidAmountTnd.equals(0)) {
    return SalePaymentState.UNPAID;
  }

  return SalePaymentState.PARTIALLY_PAID;
}

function parsePositiveQuantity(value: string): Prisma.Decimal {
  const decimal = new Prisma.Decimal(value);

  if (!decimal.greaterThan(0)) {
    throw new AppError({
      statusCode: 400,
      code: "POSITIVE_QUANTITY_REQUIRED",
      message: "La quantite doit etre superieure a zero.",
    });
  }

  return decimal.toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
}

function parseNonNegativeMoney(value: string): Prisma.Decimal {
  const decimal = new Prisma.Decimal(value);

  if (decimal.lessThan(0)) {
    throw new AppError({
      statusCode: 400,
      code: "NON_NEGATIVE_AMOUNT_REQUIRED",
      message: "Le montant doit etre positif ou nul.",
    });
  }

  return decimal.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
}

function sumDecimals(values: Prisma.Decimal[], scale: number): Prisma.Decimal {
  return values
    .reduce((total, value) => total.plus(value), new Prisma.Decimal(0))
    .toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_UP);
}

function hashPayload(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function findDuplicate(values: string[]): string | undefined {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }

    seen.add(value);
  }

  return undefined;
}

function assertVersionUpdated(count: number) {
  if (count === 0) {
    throw new AppError({
      statusCode: 409,
      code: "CONCURRENT_UPDATE",
      message: "Ce distributeur a ete modifie entre-temps.",
    });
  }
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
