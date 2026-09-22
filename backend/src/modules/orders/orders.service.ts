import {
  CustomerLedgerBalanceKind,
  CustomerLedgerEntryType,
  CustomerOrderAdvanceDisposition,
  CustomerOrderAdvanceMovement,
  CustomerOrderStatus,
  InventoryItemType,
  InventoryMovementType,
  PosSessionStatus,
  Prisma,
  SalePaymentState,
  SaleStatus,
  type PrismaClient,
} from "@prisma/client";
import { AppError } from "../../shared/appError.js";
import {
  runIdempotentCommand,
  postingTransactionOptions,
} from "../../shared/idempotency.js";

const mainTerminalCode = "main";
const mainLocationCode = "main";

/// An order may be edited only while it is still being agreed with the
/// customer. Once preparation has started the lines are a commitment.
const editableStatuses = [
  CustomerOrderStatus.DRAFT,
  CustomerOrderStatus.CONFIRMED,
] as const;

/// A draft is explicitly "not committed" in the lifecycle table, so it cannot
/// be turned into a sale without first being confirmed.
const completableStatuses = [
  CustomerOrderStatus.CONFIRMED,
  CustomerOrderStatus.PREPARING,
  CustomerOrderStatus.READY,
] as const;

const cancellableStatuses = [
  CustomerOrderStatus.DRAFT,
  CustomerOrderStatus.CONFIRMED,
  CustomerOrderStatus.PREPARING,
  CustomerOrderStatus.READY,
] as const;

/// COMPLETED is reachable only through the completion command, never through a
/// plain status change, because completion has stock and revenue effects.
const allowedStatusTransitions: Record<
  CustomerOrderStatus,
  CustomerOrderStatus[]
> = {
  [CustomerOrderStatus.DRAFT]: [CustomerOrderStatus.CONFIRMED],
  [CustomerOrderStatus.CONFIRMED]: [CustomerOrderStatus.PREPARING],
  [CustomerOrderStatus.PREPARING]: [CustomerOrderStatus.READY],
  [CustomerOrderStatus.READY]: [CustomerOrderStatus.PREPARING],
  [CustomerOrderStatus.COMPLETED]: [],
  [CustomerOrderStatus.CANCELLED]: [],
};

export interface OrderActor {
  actorUserId: string;
  correlationId?: string;
}

export interface OrderLineInput {
  productId: string;
  quantity: string;
}

export interface OrderListParams {
  status?: CustomerOrderStatus;
  customerId?: string;
  dueBefore?: Date;
  dueAfter?: Date;
  /// Section 18: overdue and upcoming orders. Only an order still awaiting
  /// fulfilment can be either; a completed or cancelled one is neither.
  dueState?: "OVERDUE" | "UPCOMING";
  asOf?: Date;
  page: number;
  pageSize: number;
}

const awaitingFulfilment = [
  CustomerOrderStatus.DRAFT,
  CustomerOrderStatus.CONFIRMED,
  CustomerOrderStatus.PREPARING,
  CustomerOrderStatus.READY,
] as const;

const orderDetailInclude = {
  customer: true,
  lines: true,
  advances: {
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
  },
  sale: {
    include: {
      lines: true,
      payments: true,
    },
  },
} satisfies Prisma.CustomerOrderInclude;

export class OrdersService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listOrders(params: OrderListParams) {
    const asOf = params.asOf ?? new Date();
    const where = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.customerId ? { customerId: params.customerId } : {}),
      ...(params.dueBefore || params.dueAfter
        ? {
            requestedFulfillmentAt: {
              ...(params.dueAfter ? { gte: params.dueAfter } : {}),
              ...(params.dueBefore ? { lte: params.dueBefore } : {}),
            },
          }
        : {}),
      ...(params.dueState
        ? {
            status: {
              in: [...awaitingFulfilment],
            },
            requestedFulfillmentAt:
              params.dueState === "OVERDUE" ? { lt: asOf } : { gte: asOf },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customerOrder.findMany({
        where,
        include: {
          customer: true,
          lines: true,
        },
        // NFR-005: stable sort, soonest due first.
        orderBy: [{ requestedFulfillmentAt: "asc" }, { id: "asc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.customerOrder.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  public async getOrder(orderId: string) {
    const order = await this.prisma.customerOrder.findUnique({
      where: {
        id: orderId,
      },
      include: orderDetailInclude,
    });

    if (!order) {
      throw new AppError({
        statusCode: 404,
        code: "ORDER_NOT_FOUND",
        message: "Commande introuvable.",
      });
    }

    return order;
  }

  public async createOrder(
    params: {
      idempotencyKey: string;
      customerId: string;
      requestedFulfillmentAt: Date;
      notes?: string;
      lines: OrderLineInput[];
    },
    actor: OrderActor,
  ) {
    const lines = normalizeOrderLines(params.lines);

    return this.runIdempotentCommand(
      "customer_order.create",
      params.idempotencyKey,
      {
        ...params,
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity.toFixed(6),
        })),
      },
      async (tx) => {
        const customer = await requireActiveCustomer(tx, params.customerId);
        const lineRows = await buildOrderLines(tx, lines);
        const totalTnd = sumDecimals(
          lineRows.map((line) => line.lineTotalTnd),
          3,
        );

        if (!totalTnd.greaterThan(0)) {
          throw new AppError({
            statusCode: 400,
            code: "ORDER_TOTAL_REQUIRED",
            message: "Le total de la commande doit etre superieur a zero.",
          });
        }

        const order = await tx.customerOrder.create({
          data: {
            reference: await nextOrderReference(tx),
            customerId: customer.id,
            status: CustomerOrderStatus.DRAFT,
            requestedFulfillmentAt: params.requestedFulfillmentAt,
            totalTnd: totalTnd.toFixed(3),
            notes: emptyToNull(params.notes),
            createdByUserId: actor.actorUserId,
            updatedByUserId: actor.actorUserId,
            correlationId: actor.correlationId,
            lines: {
              createMany: {
                data: lineRows.map(toOrderLineData),
              },
            },
          },
          include: orderDetailInclude,
        });

        await auditWithClient(tx, {
          actor,
          action: "customer_order.create",
          entity: "customer_order",
          targetId: order.id,
          after: order,
        });

        return { order };
      },
    );
  }

  public async updateOrder(
    orderId: string,
    params: {
      version: number;
      requestedFulfillmentAt?: Date;
      notes?: string;
      lines?: OrderLineInput[];
    },
    actor: OrderActor,
  ) {
    const lines = params.lines ? normalizeOrderLines(params.lines) : undefined;

    return this.prisma.$transaction(async (tx) => {
      const existing = await lockOrder(tx, orderId);

      if (!editableStatuses.includes(existing.status as never)) {
        throw new AppError({
          statusCode: 409,
          code: "ORDER_NOT_EDITABLE",
          message: "Cette commande ne peut plus etre modifiee.",
        });
      }

      let totalTnd = new Prisma.Decimal(existing.totalTnd);
      let lineRows: OrderLineRow[] | undefined;

      if (lines) {
        lineRows = await buildOrderLines(tx, lines);
        totalTnd = sumDecimals(
          lineRows.map((line) => line.lineTotalTnd),
          3,
        );

        if (!totalTnd.greaterThan(0)) {
          throw new AppError({
            statusCode: 400,
            code: "ORDER_TOTAL_REQUIRED",
            message: "Le total de la commande doit etre superieur a zero.",
          });
        }
      }

      // ORD-017: the advance already received cannot exceed the new total,
      // otherwise the excess would silently disappear.
      const advanceBalance = new Prisma.Decimal(existing.advanceBalanceTnd);

      if (advanceBalance.greaterThan(totalTnd)) {
        throw new AppError({
          statusCode: 409,
          code: "ORDER_TOTAL_BELOW_ADVANCE",
          message:
            "Le total ne peut pas etre inferieur a l'avance deja encaissee. Remboursez ou creditez l'avance d'abord.",
        });
      }

      const updated = await tx.customerOrder.updateMany({
        where: {
          id: orderId,
          version: params.version,
        },
        data: {
          ...(params.requestedFulfillmentAt !== undefined
            ? { requestedFulfillmentAt: params.requestedFulfillmentAt }
            : {}),
          ...(params.notes !== undefined
            ? { notes: emptyToNull(params.notes) }
            : {}),
          ...(lineRows ? { totalTnd: totalTnd.toFixed(3) } : {}),
          version: {
            increment: 1,
          },
          updatedByUserId: actor.actorUserId,
          correlationId: actor.correlationId,
        },
      });

      assertVersionUpdated(updated.count);

      if (lineRows) {
        await tx.customerOrderLine.deleteMany({
          where: {
            orderId,
          },
        });
        await tx.customerOrderLine.createMany({
          data: lineRows.map((line) => ({
            orderId,
            ...toOrderLineData(line),
          })),
        });
      }

      const order = await tx.customerOrder.findUniqueOrThrow({
        where: {
          id: orderId,
        },
        include: orderDetailInclude,
      });

      await auditWithClient(tx, {
        actor,
        action: "customer_order.update",
        entity: "customer_order",
        targetId: orderId,
        before: existing,
        after: order,
      });

      return { order };
    }, postingTransactionOptions);
  }

  public async changeOrderStatus(
    orderId: string,
    params: {
      version: number;
      status: CustomerOrderStatus;
    },
    actor: OrderActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await lockOrder(tx, orderId);
      const allowed = allowedStatusTransitions[existing.status];

      if (!allowed.includes(params.status)) {
        throw new AppError({
          statusCode: 409,
          code: "ORDER_STATUS_TRANSITION_INVALID",
          message: "Ce changement de statut n'est pas autorise.",
        });
      }

      const updated = await tx.customerOrder.updateMany({
        where: {
          id: orderId,
          version: params.version,
        },
        data: {
          status: params.status,
          version: {
            increment: 1,
          },
          updatedByUserId: actor.actorUserId,
          correlationId: actor.correlationId,
        },
      });

      assertVersionUpdated(updated.count);
      const order = await tx.customerOrder.findUniqueOrThrow({
        where: {
          id: orderId,
        },
        include: orderDetailInclude,
      });

      await auditWithClient(tx, {
        actor,
        action: "customer_order.change_status",
        entity: "customer_order",
        targetId: orderId,
        before: existing,
        after: order,
      });

      return { order };
    }, postingTransactionOptions);
  }

  /// ORD-009: money received before fulfilment is a customer advance. It is
  /// cash through the POS drawer, so it is tied to the open session and never
  /// recognized as sale revenue.
  public async recordOrderAdvance(
    orderId: string,
    params: {
      idempotencyKey: string;
      amountTnd: string;
      paidAt: Date;
      notes?: string;
    },
    actor: OrderActor,
  ) {
    const amountTnd = parsePositiveMoney(params.amountTnd);

    return this.runIdempotentCommand(
      `customer_order.advance.${orderId}`,
      params.idempotencyKey,
      {
        ...params,
        amountTnd: amountTnd.toFixed(3),
      },
      async (tx) => {
        const existing = await lockOrder(tx, orderId);

        if (!cancellableStatuses.includes(existing.status as never)) {
          throw new AppError({
            statusCode: 409,
            code: "ORDER_NOT_OPEN_FOR_ADVANCE",
            message: "Cette commande n'accepte plus d'avance.",
          });
        }

        const session = await requireOpenSession(tx);
        const totalTnd = new Prisma.Decimal(existing.totalTnd);
        const advanceBalance = new Prisma.Decimal(existing.advanceBalanceTnd);
        const nextBalance = advanceBalance.plus(amountTnd);

        // ORD-016: advances can never exceed the order total.
        if (nextBalance.greaterThan(totalTnd)) {
          throw new AppError({
            statusCode: 400,
            code: "ORDER_ADVANCE_EXCEEDS_TOTAL",
            message: "L'avance ne peut pas depasser le total de la commande.",
          });
        }

        const advance = await tx.customerOrderAdvance.create({
          data: {
            orderId,
            customerId: existing.customerId,
            sessionId: session.id,
            movement: CustomerOrderAdvanceMovement.RECEIPT,
            amountTnd: amountTnd.toFixed(3),
            paidAt: params.paidAt,
            notes: emptyToNull(params.notes),
            actorUserId: actor.actorUserId,
            correlationId: actor.correlationId,
          },
        });

        await tx.customerLedgerEntry.create({
          data: {
            customerId: existing.customerId,
            orderId,
            balanceKind: CustomerLedgerBalanceKind.ADVANCE,
            entryType: CustomerLedgerEntryType.ORDER_ADVANCE,
            amountTnd: amountTnd.toFixed(3),
            occurredAt: params.paidAt,
            actorUserId: actor.actorUserId,
            correlationId: actor.correlationId,
          },
        });

        await tx.customerOrder.update({
          where: {
            id: orderId,
          },
          data: {
            advanceBalanceTnd: nextBalance.toFixed(3),
            version: {
              increment: 1,
            },
            updatedByUserId: actor.actorUserId,
            correlationId: actor.correlationId,
          },
        });

        const order = await tx.customerOrder.findUniqueOrThrow({
          where: {
            id: orderId,
          },
          include: orderDetailInclude,
        });

        await auditWithClient(tx, {
          actor,
          action: "customer_order.advance",
          entity: "customer_order_advance",
          targetId: advance.id,
          before: existing,
          after: { order, advance },
        });

        return { order, advance };
      },
    );
  }

  /// ORD-010, ORD-011 and ORD-012: one atomic command creates at most one
  /// linked sale, applies the advance, records the money actually received
  /// now, creates the receivable remainder, and decreases stock.
  public async completeOrder(
    orderId: string,
    params: {
      idempotencyKey: string;
      completedAt: Date;
      paidAmountTnd?: string;
    },
    actor: OrderActor,
  ) {
    return this.runIdempotentCommand(
      `customer_order.complete.${orderId}`,
      params.idempotencyKey,
      params,
      async (tx) => {
        const existing = await lockOrder(tx, orderId);

        if (
          existing.saleId ||
          !completableStatuses.includes(existing.status as never)
        ) {
          throw new AppError({
            statusCode: 409,
            code: "ORDER_NOT_COMPLETABLE",
            message: "Cette commande ne peut pas etre terminee.",
          });
        }

        const session = await requireOpenSession(tx);
        const customer = await requireActiveCustomer(tx, existing.customerId);
        const lines = await tx.customerOrderLine.findMany({
          where: {
            orderId,
          },
          include: {
            product: {
              include: {
                baseUnit: true,
              },
            },
          },
        });

        if (lines.length === 0) {
          throw new AppError({
            statusCode: 409,
            code: "ORDER_LINES_REQUIRED",
            message: "Une commande sans ligne ne peut pas etre terminee.",
          });
        }

        const totalTnd = new Prisma.Decimal(existing.totalTnd);
        const advanceAppliedTnd = new Prisma.Decimal(
          existing.advanceBalanceTnd,
        );
        const completionPaymentTnd =
          params.paidAmountTnd === undefined
            ? totalTnd.minus(advanceAppliedTnd)
            : parseNonNegativeMoney(params.paidAmountTnd);
        const paidAmountTnd = advanceAppliedTnd
          .plus(completionPaymentTnd)
          .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);

        if (paidAmountTnd.greaterThan(totalTnd)) {
          throw new AppError({
            statusCode: 400,
            code: "SALE_OVERPAYMENT_REJECTED",
            message: "Le paiement ne peut pas depasser le total de la vente.",
          });
        }

        const remainingDueTnd = totalTnd
          .minus(paidAmountTnd)
          .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
        const sale = await tx.sale.create({
          data: {
            sessionId: session.id,
            customerId: customer.id,
            status: SaleStatus.POSTED,
            paymentState: derivePaymentState(totalTnd, paidAmountTnd),
            soldAt: params.completedAt,
            totalTnd: totalTnd.toFixed(3),
            paidAmountTnd: paidAmountTnd.toFixed(3),
            remainingDueTnd: remainingDueTnd.toFixed(3),
            postedAt: params.completedAt,
            postedByUserId: actor.actorUserId,
            correlationId: actor.correlationId,
            lines: {
              createMany: {
                data: lines.map((line) => ({
                  productId: line.productId,
                  unitId: line.unitId,
                  quantity: new Prisma.Decimal(line.quantity).toFixed(6),
                  unitPriceTnd: new Prisma.Decimal(line.unitPriceTnd).toFixed(
                    3,
                  ),
                  lineTotalTnd: new Prisma.Decimal(line.lineTotalTnd).toFixed(
                    3,
                  ),
                  productNameSnapshot: line.productNameSnapshot,
                  unitNameSnapshot: line.unitNameSnapshot,
                })),
              },
            },
          },
        });

        // Only money received now enters the drawer. The advance was already
        // counted as cash in the session that collected it.
        if (completionPaymentTnd.greaterThan(0)) {
          await tx.salePayment.create({
            data: {
              saleId: sale.id,
              sessionId: session.id,
              amountTnd: completionPaymentTnd.toFixed(3),
              paidAt: params.completedAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            },
          });
        }

        if (advanceAppliedTnd.greaterThan(0)) {
          await tx.customerLedgerEntry.create({
            data: {
              customerId: customer.id,
              orderId,
              saleId: sale.id,
              balanceKind: CustomerLedgerBalanceKind.ADVANCE,
              entryType: CustomerLedgerEntryType.ORDER_ADVANCE_APPLIED,
              amountTnd: advanceAppliedTnd.negated().toFixed(3),
              occurredAt: params.completedAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            },
          });
        }

        if (remainingDueTnd.greaterThan(0)) {
          await tx.customerLedgerEntry.create({
            data: {
              customerId: customer.id,
              orderId,
              saleId: sale.id,
              balanceKind: CustomerLedgerBalanceKind.RECEIVABLE,
              entryType: CustomerLedgerEntryType.SALE_RECEIVABLE,
              amountTnd: remainingDueTnd.toFixed(3),
              occurredAt: params.completedAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            },
          });
        }

        const mainLocation = await findMainLocation(tx);
        const stockableLines = lines.filter((line) => line.product.isStockable);

        if (stockableLines.length > 0) {
          await tx.inventoryMovement.createMany({
            data: stockableLines.map((line) => ({
              locationId: mainLocation.id,
              itemType: InventoryItemType.PRODUCT,
              productId: line.productId,
              unitId: line.product.baseUnitId,
              movementType: InventoryMovementType.POS_SALE,
              quantityDelta: new Prisma.Decimal(line.quantity)
                .negated()
                .toFixed(6),
              itemNameSnapshot: line.productNameSnapshot,
              unitNameSnapshot: line.unitNameSnapshot,
              sourceType: "CUSTOMER_ORDER_SALE",
              sourceId: sale.id,
              reason: `Commande ${existing.reference}`,
              occurredAt: params.completedAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            })),
          });
        }

        // ORD-012: the guarded update is the last invariant. Combined with the
        // row lock above, a second concurrent completion matches no row and
        // rolls its own sale back.
        const claimed = await tx.customerOrder.updateMany({
          where: {
            id: orderId,
            saleId: null,
            status: {
              in: [...completableStatuses],
            },
          },
          data: {
            status: CustomerOrderStatus.COMPLETED,
            saleId: sale.id,
            completedAt: params.completedAt,
            completedByUserId: actor.actorUserId,
            advanceBalanceTnd: "0",
            version: {
              increment: 1,
            },
            updatedByUserId: actor.actorUserId,
            correlationId: actor.correlationId,
          },
        });

        if (claimed.count !== 1) {
          throw new AppError({
            statusCode: 409,
            code: "ORDER_ALREADY_COMPLETED",
            message: "Cette commande a deja ete terminee.",
          });
        }

        const order = await tx.customerOrder.findUniqueOrThrow({
          where: {
            id: orderId,
          },
          include: orderDetailInclude,
        });

        await auditWithClient(tx, {
          actor,
          action: "customer_order.complete",
          entity: "customer_order",
          targetId: orderId,
          before: existing,
          after: order,
        });

        return { order };
      },
    );
  }

  /// ORD-013 and ORD-018: cancellation keeps the order in history with its
  /// reason, and an advance must be explicitly refunded or kept as customer
  /// credit. Money cannot disappear.
  public async cancelOrder(
    orderId: string,
    params: {
      idempotencyKey: string;
      cancelledAt: Date;
      reason: string;
      advanceDisposition?: CustomerOrderAdvanceDisposition;
    },
    actor: OrderActor,
  ) {
    const reason = params.reason.trim();

    if (!reason) {
      throw new AppError({
        statusCode: 400,
        code: "ORDER_CANCELLATION_REASON_REQUIRED",
        message: "Un motif d'annulation est obligatoire.",
      });
    }

    return this.runIdempotentCommand(
      `customer_order.cancel.${orderId}`,
      params.idempotencyKey,
      {
        ...params,
        reason,
      },
      async (tx) => {
        const existing = await lockOrder(tx, orderId);

        if (!cancellableStatuses.includes(existing.status as never)) {
          throw new AppError({
            statusCode: 409,
            code: "ORDER_NOT_CANCELLABLE",
            message: "Cette commande ne peut plus etre annulee.",
          });
        }

        const advanceBalance = new Prisma.Decimal(existing.advanceBalanceTnd);
        const hasAdvance = advanceBalance.greaterThan(0);

        if (hasAdvance && !params.advanceDisposition) {
          throw new AppError({
            statusCode: 400,
            code: "ORDER_ADVANCE_DISPOSITION_REQUIRED",
            message:
              "Choisissez le remboursement ou le credit client pour l'avance.",
          });
        }

        if (!hasAdvance && params.advanceDisposition) {
          throw new AppError({
            statusCode: 400,
            code: "ORDER_ADVANCE_DISPOSITION_NOT_APPLICABLE",
            message: "Cette commande n'a aucune avance a traiter.",
          });
        }

        let refund: { id: string } | undefined;

        if (hasAdvance) {
          await tx.customerLedgerEntry.create({
            data: {
              customerId: existing.customerId,
              orderId,
              balanceKind: CustomerLedgerBalanceKind.ADVANCE,
              entryType:
                params.advanceDisposition ===
                CustomerOrderAdvanceDisposition.REFUNDED
                  ? CustomerLedgerEntryType.ORDER_ADVANCE_REFUNDED
                  : CustomerLedgerEntryType.ORDER_ADVANCE_CREDITED,
              amountTnd: advanceBalance.negated().toFixed(3),
              occurredAt: params.cancelledAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            },
          });

          if (
            params.advanceDisposition ===
            CustomerOrderAdvanceDisposition.REFUNDED
          ) {
            // Cash leaves the drawer now, so the refund belongs to the open
            // session and reduces its expected closing cash.
            const session = await requireOpenSession(tx);
            refund = await tx.customerOrderAdvance.create({
              data: {
                orderId,
                customerId: existing.customerId,
                sessionId: session.id,
                movement: CustomerOrderAdvanceMovement.REFUND,
                amountTnd: advanceBalance.toFixed(3),
                paidAt: params.cancelledAt,
                notes: reason,
                actorUserId: actor.actorUserId,
                correlationId: actor.correlationId,
              },
            });
          } else {
            // Kept as customer credit: a negative receivable the customer can
            // spend on a later sale.
            await tx.customerLedgerEntry.create({
              data: {
                customerId: existing.customerId,
                orderId,
                balanceKind: CustomerLedgerBalanceKind.RECEIVABLE,
                entryType: CustomerLedgerEntryType.ORDER_ADVANCE_CREDITED,
                amountTnd: advanceBalance.negated().toFixed(3),
                occurredAt: params.cancelledAt,
                actorUserId: actor.actorUserId,
                correlationId: actor.correlationId,
              },
            });
          }
        }

        const cancelled = await tx.customerOrder.updateMany({
          where: {
            id: orderId,
            status: {
              in: [...cancellableStatuses],
            },
          },
          data: {
            status: CustomerOrderStatus.CANCELLED,
            cancelledAt: params.cancelledAt,
            cancelledByUserId: actor.actorUserId,
            cancellationReason: reason,
            advanceDisposition: params.advanceDisposition ?? null,
            advanceBalanceTnd: "0",
            version: {
              increment: 1,
            },
            updatedByUserId: actor.actorUserId,
            correlationId: actor.correlationId,
          },
        });

        if (cancelled.count !== 1) {
          throw new AppError({
            statusCode: 409,
            code: "ORDER_NOT_CANCELLABLE",
            message: "Cette commande ne peut plus etre annulee.",
          });
        }

        const order = await tx.customerOrder.findUniqueOrThrow({
          where: {
            id: orderId,
          },
          include: orderDetailInclude,
        });

        await auditWithClient(tx, {
          actor,
          action: "customer_order.cancel",
          entity: "customer_order",
          targetId: orderId,
          before: existing,
          after: { order, refund },
        });

        return { order };
      },
    );
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

interface OrderLineRow {
  productId: string;
  unitId: string;
  quantity: Prisma.Decimal;
  unitPriceTnd: Prisma.Decimal;
  lineTotalTnd: Prisma.Decimal;
  productNameSnapshot: string;
  unitNameSnapshot: string;
}

function toOrderLineData(line: OrderLineRow) {
  return {
    productId: line.productId,
    unitId: line.unitId,
    quantity: line.quantity.toFixed(6),
    unitPriceTnd: line.unitPriceTnd.toFixed(3),
    lineTotalTnd: line.lineTotalTnd.toFixed(3),
    productNameSnapshot: line.productNameSnapshot,
    unitNameSnapshot: line.unitNameSnapshot,
  };
}

function normalizeOrderLines(lines: OrderLineInput[]) {
  if (lines.length === 0) {
    throw new AppError({
      statusCode: 400,
      code: "ORDER_LINES_REQUIRED",
      message: "Ajoutez au moins une ligne a la commande.",
    });
  }

  const normalized = lines.map((line) => ({
    productId: line.productId,
    quantity: parsePositiveQuantity(line.quantity),
  }));

  if (findDuplicate(normalized.map((line) => line.productId))) {
    throw new AppError({
      statusCode: 400,
      code: "DUPLICATE_ORDER_LINE",
      message: "Un produit ne peut apparaitre qu'une seule fois.",
    });
  }

  return normalized;
}

/// ORD-002 and POS-014: the order snapshots the product, unit and price agreed
/// at order time, so a later catalogue price change does not rewrite history.
async function buildOrderLines(
  client: Prisma.TransactionClient,
  lines: Array<{ productId: string; quantity: Prisma.Decimal }>,
): Promise<OrderLineRow[]> {
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
        code: "ORDER_PRODUCT_REQUIRED",
        message: "Chaque ligne doit viser un produit actif.",
      });
    }

    const unitPriceTnd = new Prisma.Decimal(product.salePriceTnd);

    return {
      productId: product.id,
      unitId: product.baseUnitId,
      quantity: line.quantity,
      unitPriceTnd,
      lineTotalTnd: line.quantity
        .mul(unitPriceTnd)
        .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP),
      productNameSnapshot: product.name,
      unitNameSnapshot: product.baseUnit.name,
    };
  });
}

/// Serializes concurrent commands on one order. A second completion attempt
/// waits here and then sees the committed COMPLETED state.
async function lockOrder(client: Prisma.TransactionClient, orderId: string) {
  await client.$queryRaw`SELECT "id" FROM "customer_orders" WHERE "id" = ${orderId} FOR UPDATE`;

  const order = await client.customerOrder.findUnique({
    where: {
      id: orderId,
    },
  });

  if (!order) {
    throw new AppError({
      statusCode: 404,
      code: "ORDER_NOT_FOUND",
      message: "Commande introuvable.",
    });
  }

  return order;
}

async function requireActiveCustomer(
  client: Prisma.TransactionClient,
  customerId: string,
) {
  const customer = await client.customer.findUnique({
    where: {
      id: customerId,
    },
  });

  if (!customer || !customer.isActive) {
    throw new AppError({
      statusCode: 400,
      code: "ACTIVE_CUSTOMER_REQUIRED",
      message: "Un client actif est obligatoire pour une commande.",
    });
  }

  return customer;
}

async function requireOpenSession(client: Prisma.TransactionClient) {
  const session = await client.posSession.findFirst({
    where: {
      status: PosSessionStatus.OPEN,
      terminal: {
        code: mainTerminalCode,
      },
    },
  });

  if (!session) {
    throw new AppError({
      statusCode: 409,
      code: "POS_SESSION_NOT_OPEN",
      message: "Ouvrez une session de caisse avant cette operation.",
    });
  }

  return session;
}

async function findMainLocation(client: Prisma.TransactionClient) {
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

async function nextOrderReference(client: Prisma.TransactionClient) {
  const rows = await client.$queryRaw<
    Array<{ nextval: bigint }>
  >`SELECT nextval('customer_order_reference_seq')`;
  const sequence = rows[0]?.nextval ?? BigInt(1);

  return `CMD-${sequence.toString().padStart(6, "0")}`;
}

async function auditWithClient(
  client: Prisma.TransactionClient,
  params: {
    actor?: OrderActor;
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

function parsePositiveMoney(value: string): Prisma.Decimal {
  const decimal = new Prisma.Decimal(value);

  if (!decimal.greaterThan(0)) {
    throw new AppError({
      statusCode: 400,
      code: "POSITIVE_AMOUNT_REQUIRED",
      message: "Le montant doit etre superieur a zero.",
    });
  }

  return decimal.toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
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

function assertVersionUpdated(count: number) {
  if (count === 0) {
    throw new AppError({
      statusCode: 409,
      code: "VERSION_CONFLICT",
      message: "Cette commande a ete modifiee entre-temps.",
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
