import {
  InventoryItemType,
  InventoryMovementType,
  CustomerLedgerBalanceKind,
  CustomerLedgerEntryType,
  CustomerOrderAdvanceMovement,
  PosSessionStatus,
  Prisma,
  SalePaymentState,
  SaleStatus,
  type PrismaClient,
} from "@prisma/client";
import { createHash } from "node:crypto";
import { AppError } from "../../shared/appError.js";
import { normalizeName } from "../catalog/catalog.service.js";

const mainTerminalCode = "main";
const mainLocationCode = "main";

export interface PosActor {
  actorUserId: string;
  correlationId?: string;
}

export interface SaleLineInput {
  productId: string;
  quantity: string;
}

export interface PosProductListParams {
  search?: string;
  page: number;
  pageSize: number;
}

export class PosService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async bootstrapPosData(): Promise<void> {
    await this.prisma.posTerminal.upsert({
      where: {
        code: mainTerminalCode,
      },
      create: {
        code: mainTerminalCode,
        name: "Caisse principale",
        isActive: true,
      },
      update: {
        name: "Caisse principale",
        isActive: true,
      },
    });
  }

  public async getCurrentSession() {
    return this.prisma.posSession.findFirst({
      where: {
        status: PosSessionStatus.OPEN,
        terminal: {
          code: mainTerminalCode,
        },
      },
      include: {
        terminal: true,
      },
      orderBy: {
        openedAt: "desc",
      },
    });
  }

  public async listProducts(params: PosProductListParams) {
    const search = params.search?.trim();
    const where = {
      isActive: true,
      ...(search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                code: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
              {
                barcode: {
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: {
          baseUnit: true,
          category: true,
        },
        orderBy: [{ name: "asc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  public async listCustomers(params: PosProductListParams) {
    const search = params.search?.trim();
    const normalizedSearch = search ? normalizeName(search) : undefined;
    const where = {
      isActive: true,
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
                  contains: search,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: [{ name: "asc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  public async openSession(
    params: {
      idempotencyKey: string;
      openingCashTnd: string;
      openedAt: Date;
      notes?: string;
    },
    actor: PosActor,
  ) {
    const openingCashTnd = parseNonNegativeMoney(params.openingCashTnd);

    return this.runIdempotentCommand(
      "pos_session.open",
      params.idempotencyKey,
      {
        ...params,
        openingCashTnd: openingCashTnd.toFixed(3),
      },
      async (tx) => {
        const terminal = await this.findMainTerminal(tx);
        const existingOpen = await tx.posSession.findFirst({
          where: {
            terminalId: terminal.id,
            status: PosSessionStatus.OPEN,
          },
        });

        if (existingOpen) {
          throw new AppError({
            statusCode: 409,
            code: "POS_SESSION_ALREADY_OPEN",
            message: "Une session de caisse est deja ouverte.",
          });
        }

        try {
          const session = await tx.posSession.create({
            data: {
              terminalId: terminal.id,
              openedAt: params.openedAt,
              openedByUserId: actor.actorUserId,
              openingCashTnd: openingCashTnd.toFixed(3),
              notes: emptyToNull(params.notes),
              correlationId: actor.correlationId,
            },
            include: {
              terminal: true,
            },
          });

          await this.auditWithClient(tx, {
            actor,
            action: "pos_session.open",
            entity: "pos_session",
            targetId: session.id,
            after: session,
          });

          return { session };
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            throw new AppError({
              statusCode: 409,
              code: "POS_SESSION_ALREADY_OPEN",
              message: "Une session de caisse est deja ouverte.",
            });
          }

          throw error;
        }
      },
    );
  }

  public async closeSession(
    sessionId: string,
    params: {
      idempotencyKey: string;
      countedCashTnd: string;
      closedAt: Date;
      notes?: string;
    },
    actor: PosActor,
  ) {
    const countedCashTnd = parseNonNegativeMoney(params.countedCashTnd);

    return this.runIdempotentCommand(
      `pos_session.close.${sessionId}`,
      params.idempotencyKey,
      {
        ...params,
        countedCashTnd: countedCashTnd.toFixed(3),
      },
      async (tx) => {
        const existing = await tx.posSession.findUnique({
          where: {
            id: sessionId,
          },
        });

        if (!existing || existing.status !== PosSessionStatus.OPEN) {
          throw new AppError({
            statusCode: 409,
            code: "POS_SESSION_NOT_OPEN",
            message: "La session de caisse n'est pas ouverte.",
          });
        }

        const payments = await tx.salePayment.findMany({
          where: {
            sessionId,
          },
        });
        // Order advances and refunds are real cash through this drawer, so the
        // expected close must include them alongside sale payments.
        const orderAdvances = await tx.customerOrderAdvance.findMany({
          where: {
            sessionId,
          },
        });
        const expectedCashTnd = sumDecimals(
          [
            new Prisma.Decimal(existing.openingCashTnd),
            ...payments.map((payment) => new Prisma.Decimal(payment.amountTnd)),
            ...orderAdvances.map((advance) => {
              const amount = new Prisma.Decimal(advance.amountTnd);
              return advance.movement === CustomerOrderAdvanceMovement.RECEIPT
                ? amount
                : amount.negated();
            }),
          ],
          3,
        );
        const cashDifferenceTnd = countedCashTnd.minus(expectedCashTnd);

        const session = await tx.posSession.update({
          where: {
            id: sessionId,
          },
          data: {
            status: PosSessionStatus.CLOSED,
            closedAt: params.closedAt,
            closedByUserId: actor.actorUserId,
            countedCashTnd: countedCashTnd.toFixed(3),
            expectedCashTnd: expectedCashTnd.toFixed(3),
            cashDifferenceTnd: cashDifferenceTnd.toFixed(3),
            notes: emptyToNull(params.notes) ?? existing.notes,
            correlationId: actor.correlationId,
          },
          include: {
            terminal: true,
          },
        });

        await this.auditWithClient(tx, {
          actor,
          action: "pos_session.close",
          entity: "pos_session",
          targetId: session.id,
          before: existing,
          after: session,
        });

        return { session };
      },
    );
  }

  public async postPaidSale(
    params: {
      idempotencyKey: string;
      sessionId?: string;
      customerId?: string;
      soldAt: Date;
      paidAmountTnd?: string;
      lines: SaleLineInput[];
    },
    actor: PosActor,
  ) {
    const lines = params.lines.map((line) => ({
      productId: line.productId,
      quantity: parsePositiveQuantity(line.quantity),
    }));
    const duplicateProductId = findDuplicate(
      lines.map((line) => line.productId),
    );

    if (duplicateProductId) {
      throw new AppError({
        statusCode: 400,
        code: "DUPLICATE_SALE_LINE",
        message: "Un produit ne peut apparaitre qu'une seule fois.",
      });
    }

    return this.runIdempotentCommand(
      `pos_sale.post.${params.sessionId ?? "current"}`,
      params.idempotencyKey,
      {
        ...params,
        paidAmountTnd: params.paidAmountTnd,
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity.toFixed(6),
        })),
      },
      async (tx) => {
        const session = params.sessionId
          ? await tx.posSession.findUnique({
              where: {
                id: params.sessionId,
              },
            })
          : await tx.posSession.findFirst({
              where: {
                status: PosSessionStatus.OPEN,
                terminal: {
                  code: mainTerminalCode,
                },
              },
            });

        if (!session || session.status !== PosSessionStatus.OPEN) {
          throw new AppError({
            statusCode: 409,
            code: "POS_SESSION_NOT_OPEN",
            message: "Ouvrez une session de caisse avant de vendre.",
          });
        }

        const products = await tx.product.findMany({
          where: {
            id: {
              in: lines.map((line) => line.productId),
            },
          },
          include: {
            baseUnit: true,
          },
        });

        if (products.length !== lines.length) {
          throw new AppError({
            statusCode: 400,
            code: "SALE_PRODUCT_REQUIRED",
            message: "Chaque ligne doit viser un produit actif.",
          });
        }

        const lineRows = lines.map((line) => {
          const product = products.find((item) => item.id === line.productId);

          if (!product || !product.isActive) {
            throw new AppError({
              statusCode: 400,
              code: "SALE_PRODUCT_REQUIRED",
              message: "Chaque ligne doit viser un produit actif.",
            });
          }

          const unitPriceTnd = new Prisma.Decimal(product.salePriceTnd);
          const lineTotalTnd = line.quantity
            .mul(unitPriceTnd)
            .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);

          return {
            product,
            quantity: line.quantity,
            unitPriceTnd,
            lineTotalTnd,
          };
        });
        const totalTnd = sumDecimals(
          lineRows.map((line) => line.lineTotalTnd),
          3,
        );

        if (!totalTnd.greaterThan(0)) {
          throw new AppError({
            statusCode: 400,
            code: "SALE_TOTAL_REQUIRED",
            message: "Le total de la vente doit etre superieur a zero.",
          });
        }
        const paidAmountTnd =
          params.paidAmountTnd === undefined
            ? totalTnd
            : parseNonNegativeMoney(params.paidAmountTnd);
        const remainingDueTnd = totalTnd
          .minus(paidAmountTnd)
          .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);

        if (paidAmountTnd.greaterThan(totalTnd)) {
          throw new AppError({
            statusCode: 400,
            code: "SALE_OVERPAYMENT_REJECTED",
            message: "Le paiement ne peut pas depasser le total de la vente.",
          });
        }

        const paymentState = derivePaymentState(totalTnd, paidAmountTnd);
        let customer:
          Awaited<ReturnType<typeof tx.customer.findUnique>> | undefined;

        if (remainingDueTnd.greaterThan(0)) {
          if (!params.customerId) {
            throw new AppError({
              statusCode: 400,
              code: "CUSTOMER_REQUIRED_FOR_CREDIT",
              message: "Un client est obligatoire pour une vente a credit.",
            });
          }

          customer = await tx.customer.findUnique({
            where: {
              id: params.customerId,
            },
          });

          if (!customer || !customer.isActive) {
            throw new AppError({
              statusCode: 400,
              code: "ACTIVE_CUSTOMER_REQUIRED",
              message: "Un client actif est obligatoire pour cette vente.",
            });
          }
        } else if (params.customerId) {
          customer = await tx.customer.findUnique({
            where: {
              id: params.customerId,
            },
          });
        }

        const sale = await tx.sale.create({
          data: {
            sessionId: session.id,
            customerId: customer?.id,
            status: SaleStatus.POSTED,
            paymentState,
            soldAt: params.soldAt,
            totalTnd: totalTnd.toFixed(3),
            paidAmountTnd: paidAmountTnd.toFixed(3),
            remainingDueTnd: remainingDueTnd.toFixed(3),
            postedAt: params.soldAt,
            postedByUserId: actor.actorUserId,
            correlationId: actor.correlationId,
            lines: {
              createMany: {
                data: lineRows.map((line) => ({
                  productId: line.product.id,
                  unitId: line.product.baseUnitId,
                  quantity: line.quantity.toFixed(6),
                  unitPriceTnd: line.unitPriceTnd.toFixed(3),
                  lineTotalTnd: line.lineTotalTnd.toFixed(3),
                  productNameSnapshot: line.product.name,
                  unitNameSnapshot: line.product.baseUnit.name,
                })),
              },
            },
          },
          include: {
            lines: true,
            payments: true,
          },
        });

        if (paidAmountTnd.greaterThan(0)) {
          await tx.salePayment.create({
            data: {
              saleId: sale.id,
              sessionId: session.id,
              amountTnd: paidAmountTnd.toFixed(3),
              paidAt: params.soldAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            },
          });
        }

        if (customer && remainingDueTnd.greaterThan(0)) {
          await tx.customerLedgerEntry.create({
            data: {
              customerId: customer.id,
              saleId: sale.id,
              balanceKind: CustomerLedgerBalanceKind.RECEIVABLE,
              entryType: CustomerLedgerEntryType.SALE_RECEIVABLE,
              amountTnd: remainingDueTnd.toFixed(3),
              occurredAt: params.soldAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            },
          });
        }

        const mainLocation = await this.findMainLocation(tx);
        const stockableRows = lineRows.filter(
          (line) => line.product.isStockable,
        );

        if (stockableRows.length > 0) {
          await tx.inventoryMovement.createMany({
            data: stockableRows.map((line) => ({
              locationId: mainLocation.id,
              itemType: InventoryItemType.PRODUCT,
              productId: line.product.id,
              unitId: line.product.baseUnitId,
              movementType: InventoryMovementType.POS_SALE,
              quantityDelta: line.quantity.negated().toFixed(6),
              itemNameSnapshot: line.product.name,
              unitNameSnapshot: line.product.baseUnit.name,
              sourceType: "POS_SALE",
              sourceId: sale.id,
              reason: "Vente caisse",
              occurredAt: params.soldAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            })),
          });
        }

        const result = await tx.sale.findUniqueOrThrow({
          where: {
            id: sale.id,
          },
          include: {
            lines: true,
            payments: true,
          },
        });

        await this.auditWithClient(tx, {
          actor,
          action: "pos_sale.post",
          entity: "sale",
          targetId: result.id,
          after: result,
        });

        return { sale: result };
      },
    );
  }

  private async findMainTerminal(client: Prisma.TransactionClient) {
    const terminal = await client.posTerminal.findUnique({
      where: {
        code: mainTerminalCode,
      },
    });

    if (!terminal || !terminal.isActive) {
      throw new AppError({
        statusCode: 500,
        code: "MAIN_POS_TERMINAL_MISSING",
        message: "La caisse principale est introuvable.",
      });
    }

    return terminal;
  }

  private async findMainLocation(client: Prisma.TransactionClient) {
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

    return location;
  }

  private async auditWithClient(
    client: Prisma.TransactionClient,
    params: {
      actor?: PosActor;
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

function sumDecimals(values: Prisma.Decimal[], scale: number): Prisma.Decimal {
  return values
    .reduce((total, value) => total.plus(value), new Prisma.Decimal(0))
    .toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_UP);
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
