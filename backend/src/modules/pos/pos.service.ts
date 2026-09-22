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
import { AppError } from "../../shared/appError.js";
import { orderByFor, type SortSpec } from "../../shared/listQuery.js";
import { runIdempotentCommand } from "../../shared/idempotency.js";
import { nextSaleReference } from "../../shared/references.js";
import { sumOrZero } from "../../shared/ledger.js";
import { normalizeName } from "../../shared/text.js";

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
  sort?: SortSpec<"name">;
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
    // Names are matched on their accent-stripped form so "the" finds
    // "Thé à la menthe" at the till, exactly as in the back office.
    const where = {
      isActive: true,
      ...(search
        ? {
            OR: [
              {
                normalizedName: {
                  contains: normalizeName(search),
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
        orderBy: orderByFor<"name", Prisma.ProductOrderByWithRelationInput>(
          params.sort,
          { name: (direction) => [{ name: direction }] },
          [{ name: "asc" }],
          { id: "asc" },
        ),
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
        orderBy: orderByFor<"name", Prisma.CustomerOrderByWithRelationInput>(
          params.sort,
          { name: (direction) => [{ name: direction }] },
          [{ name: "asc" }],
          { id: "asc" },
        ),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  /// Section 18: POS sales by date, customer, payment state, and cashier.
  public async listSales(params: {
    sort?: SortSpec<"soldAt" | "totalTnd">;
    from?: Date;
    to?: Date;
    customerId?: string;
    paymentState?: SalePaymentState;
    cashierUserId?: string;
    sessionId?: string;
    page: number;
    pageSize: number;
  }) {
    const where = {
      ...(params.customerId ? { customerId: params.customerId } : {}),
      ...(params.paymentState ? { paymentState: params.paymentState } : {}),
      ...(params.cashierUserId ? { postedByUserId: params.cashierUserId } : {}),
      ...(params.sessionId ? { sessionId: params.sessionId } : {}),
      ...(params.from || params.to
        ? {
            soldAt: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        // List rows carry the sale header only; lines and payments belong to
        // the sale detail and would multiply the payload by the line count.
        include: {
          customer: true,
        },
        // NFR-005: stable sort. The id breaks ties so paging cannot repeat or
        // skip a sale posted in the same millisecond as another.
        orderBy: orderByFor<
          "soldAt" | "totalTnd",
          Prisma.SaleOrderByWithRelationInput
        >(
          params.sort,
          {
            soldAt: (direction) => [{ soldAt: direction }],
            totalTnd: (direction) => [{ totalTnd: direction }],
          },
          [{ soldAt: "desc" }],
          { id: "desc" },
        ),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.sale.count({ where }),
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
            message: "Une session de caisse est déjà ouverte.",
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
              message: "Une session de caisse est déjà ouverte.",
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

        // The drawer's expected cash is summed by the database: sale payments,
        // order advances (receipts minus refunds, which are real cash through
        // this drawer) and customer payments collected at the till. Back-office
        // payments have no session and are not counted, matching the
        // source-of-truth expected-cash formula.
        const salePaymentTotal = await tx.salePayment.aggregate({
          where: { sessionId },
          _sum: { amountTnd: true },
        });
        const advanceTotals = await tx.customerOrderAdvance.groupBy({
          by: ["movement"],
          where: { sessionId },
          _sum: { amountTnd: true },
        });
        const customerPaymentTotal = await tx.customerPayment.aggregate({
          where: { sessionId },
          _sum: { amountTnd: true },
        });
        const advanceReceipts = sumOrZero(
          advanceTotals.find(
            (row) => row.movement === CustomerOrderAdvanceMovement.RECEIPT,
          )?._sum.amountTnd,
        );
        const advanceRefunds = sumOrZero(
          advanceTotals.find(
            (row) => row.movement !== CustomerOrderAdvanceMovement.RECEIPT,
          )?._sum.amountTnd,
        );
        const expectedCashTnd = new Prisma.Decimal(existing.openingCashTnd)
          .plus(sumOrZero(salePaymentTotal._sum.amountTnd))
          .plus(advanceReceipts)
          .minus(advanceRefunds)
          .plus(sumOrZero(customerPaymentTotal._sum.amountTnd))
          .toDecimalPlaces(3);
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
            message: "Le total de la vente doit être supérieur à zéro.",
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
            message: "Le paiement ne peut pas dépasser le total de la vente.",
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
            reference: await nextSaleReference(tx),
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

  public async getSale(saleId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        customer: true,
        lines: true,
        payments: true,
        session: { include: { terminal: true } },
      },
    });

    if (!sale) {
      throw new AppError({
        statusCode: 404,
        code: "SALE_NOT_FOUND",
        message: "Vente introuvable.",
      });
    }

    return sale;
  }

  /// Session history for the Z-report screen.
  public async listSessions(params: {
    from?: Date;
    to?: Date;
    status?: PosSessionStatus;
    cashierUserId?: string;
    sort?: SortSpec<"openedAt">;
    page: number;
    pageSize: number;
  }) {
    const where = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.cashierUserId ? { openedByUserId: params.cashierUserId } : {}),
      ...(params.from || params.to
        ? {
            openedAt: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.posSession.findMany({
        where,
        include: { terminal: true },
        orderBy: orderByFor<
          "openedAt",
          Prisma.PosSessionOrderByWithRelationInput
        >(
          params.sort,
          { openedAt: (direction) => [{ openedAt: direction }] },
          [{ openedAt: "desc" }],
          { id: "desc" },
        ),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.posSession.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  /// A session with its drawer totals, summed by the database: sales, cash
  /// taken at the till, credit granted, order advances in and out, and
  /// customer payments collected at the till.
  public async getSession(sessionId: string) {
    const session = await this.prisma.posSession.findUnique({
      where: { id: sessionId },
      include: { terminal: true },
    });

    if (!session) {
      throw new AppError({
        statusCode: 404,
        code: "POS_SESSION_NOT_FOUND",
        message: "Session de caisse introuvable.",
      });
    }

    const [sales, salePayments, advances, customerPayments] = await Promise.all(
      [
        this.prisma.sale.aggregate({
          where: { sessionId, status: SaleStatus.POSTED },
          _count: { _all: true },
          _sum: { totalTnd: true, remainingDueTnd: true },
        }),
        this.prisma.salePayment.aggregate({
          where: { sessionId },
          _sum: { amountTnd: true },
        }),
        this.prisma.customerOrderAdvance.groupBy({
          by: ["movement"],
          where: { sessionId },
          _sum: { amountTnd: true },
        }),
        this.prisma.customerPayment.aggregate({
          where: { sessionId },
          _sum: { amountTnd: true },
        }),
      ],
    );
    const advanceOf = (movement: CustomerOrderAdvanceMovement) =>
      sumOrZero(
        advances.find((row) => row.movement === movement)?._sum.amountTnd,
      );

    return {
      session,
      totals: {
        salesCount: sales._count._all,
        salesTotalTnd: sumOrZero(sales._sum.totalTnd).toFixed(3),
        creditGrantedTnd: sumOrZero(sales._sum.remainingDueTnd).toFixed(3),
        cashCollectedTnd: sumOrZero(salePayments._sum.amountTnd).toFixed(3),
        advancesReceivedTnd: advanceOf(
          CustomerOrderAdvanceMovement.RECEIPT,
        ).toFixed(3),
        advancesRefundedTnd: advanceOf(
          CustomerOrderAdvanceMovement.REFUND,
        ).toFixed(3),
        customerPaymentsTnd: sumOrZero(customerPayments._sum.amountTnd).toFixed(
          3,
        ),
      },
    };
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

  private runIdempotentCommand<TResponse>(
    scope: string,
    key: string,
    payload: unknown,
    execute: (tx: Prisma.TransactionClient) => Promise<TResponse>,
  ): Promise<TResponse> {
    return runIdempotentCommand({
      prisma: this.prisma,
      scope,
      key,
      payload,
      execute,
    });
  }
}

function parsePositiveQuantity(value: string): Prisma.Decimal {
  const decimal = new Prisma.Decimal(value);

  if (!decimal.greaterThan(0)) {
    throw new AppError({
      statusCode: 400,
      code: "POSITIVE_QUANTITY_REQUIRED",
      message: "La quantité doit être supérieure à zéro.",
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
      message: "Le montant doit être positif ou nul.",
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
