import {
  DistributorDispatchStatus,
  DistributorLedgerEntryType,
  InventoryItemType,
  InventoryMovementType,
  Prisma,
  SalePaymentState,
  SaleStatus,
  type PrismaClient,
} from "@prisma/client";
import { AppError } from "../../shared/appError.js";
import { runIdempotentCommand } from "../../shared/idempotency.js";
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

/// An allocation targets exactly one receivable document: a direct sale or a
/// settlement.
export interface DistributorAllocationInput {
  saleId?: string;
  settlementId?: string;
  amountTnd: string;
}

export interface SettlementLineInput {
  dispatchLineId: string;
  soldQuantity?: string;
  returnedQuantity?: string;
  unaccountedQuantity?: string;
  /// DST-029 is open, so the sold price is confirmed at settlement time.
  unitPriceTnd: string;
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

  public async listDispatches(params: {
    distributorId?: string;
    status?: DistributorDispatchStatus;
    page: number;
    pageSize: number;
  }) {
    const where = {
      ...(params.distributorId ? { distributorId: params.distributorId } : {}),
      ...(params.status ? { status: params.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.distributorDispatch.findMany({
        where,
        include: {
          distributor: true,
          lines: true,
        },
        orderBy: [{ dispatchedAt: "desc" }, { createdAt: "desc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.distributorDispatch.count({ where }),
    ]);

    return paginated(
      items.map((dispatch) => ({
        ...dispatch,
        lines: dispatch.lines.map(withCustody),
      })),
      total,
      params,
    );
  }

  /// Section 18: distributor settlement history as its own list, not only
  /// nested under a dispatch.
  public async listSettlements(params: {
    distributorId?: string;
    dispatchId?: string;
    from?: Date;
    to?: Date;
    page: number;
    pageSize: number;
  }) {
    const where = {
      ...(params.distributorId ? { distributorId: params.distributorId } : {}),
      ...(params.dispatchId ? { dispatchId: params.dispatchId } : {}),
      ...(params.from || params.to
        ? {
            settledAt: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.distributorSettlement.findMany({
        where,
        include: {
          distributor: true,
          dispatch: true,
          lines: true,
        },
        // NFR-005: stable sort.
        orderBy: [{ settledAt: "desc" }, { id: "desc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.distributorSettlement.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  public async getDispatch(dispatchId: string) {
    const dispatch = await this.prisma.distributorDispatch.findUnique({
      where: {
        id: dispatchId,
      },
      include: {
        distributor: true,
        lines: true,
        settlements: {
          include: {
            lines: true,
          },
          orderBy: [{ settledAt: "asc" }],
        },
      },
    });

    if (!dispatch) {
      throw new AppError({
        statusCode: 404,
        code: "DISPATCH_NOT_FOUND",
        message: "Bon de livraison introuvable.",
      });
    }

    return {
      ...dispatch,
      lines: dispatch.lines.map(withCustody),
    };
  }

  /// DST-011 to DST-015. Dispatch transfers custody only: goods stay
  /// bakery-owned, so this writes no sale, receivable, or payment. Main stock
  /// decreases and the quantity stays held until a settlement classifies it.
  public async dispatchConsignment(
    params: {
      idempotencyKey: string;
      distributorId: string;
      dispatchedAt: Date;
      notes?: string;
      lines: Array<{ productId: string; quantity: string }>;
    },
    actor: DistributionActor,
  ) {
    const lines = normalizeDispatchLines(params.lines);

    return this.runIdempotentCommand(
      `distributor_dispatch.post.${params.distributorId}`,
      params.idempotencyKey,
      {
        ...params,
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity.toFixed(6),
        })),
      },
      async (tx) => {
        const distributor = await requireActiveDistributor(
          tx,
          params.distributorId,
        );
        const lineRows = await buildDispatchLines(tx, lines);
        const dispatch = await tx.distributorDispatch.create({
          data: {
            reference: await nextReference(
              tx,
              "distributor_dispatch_reference_seq",
              "BL",
            ),
            distributorId: distributor.id,
            status: DistributorDispatchStatus.OPEN,
            dispatchedAt: params.dispatchedAt,
            notes: emptyToNull(params.notes),
            postedByUserId: actor.actorUserId,
            correlationId: actor.correlationId,
            lines: {
              createMany: {
                data: lineRows.map((line) => ({
                  productId: line.productId,
                  unitId: line.unitId,
                  dispatchedQuantity: line.quantity.toFixed(6),
                  productNameSnapshot: line.productNameSnapshot,
                  unitNameSnapshot: line.unitNameSnapshot,
                })),
              },
            },
          },
        });

        await writeStockMovements(tx, {
          rows: lineRows.filter((line) => line.isStockable),
          movementType: InventoryMovementType.DISTRIBUTOR_DISPATCH_OUT,
          sourceType: "DISTRIBUTOR_DISPATCH",
          sourceId: dispatch.id,
          reason: `Depot consignation ${dispatch.reference}`,
          occurredAt: params.dispatchedAt,
          signedQuantity: (quantity) => quantity.negated(),
          actor,
        });

        const result = await tx.distributorDispatch.findUniqueOrThrow({
          where: {
            id: dispatch.id,
          },
          include: {
            distributor: true,
            lines: true,
          },
        });

        await auditWithClient(tx, {
          actor,
          action: "distributor_dispatch.post",
          entity: "distributor_dispatch",
          targetId: result.id,
          after: result,
        });

        return {
          dispatch: {
            ...result,
            lines: result.lines.map(withCustody),
          },
        };
      },
    );
  }

  /// DST-016 to DST-023 and AS-015. Settlement classifies dispatched quantity.
  /// Only the sold part becomes revenue and receivable, returns re-enter main
  /// stock, still-held quantity stays in custody, and unaccounted quantity is
  /// recorded as a discrepancy without creating automatic debt.
  public async postSettlement(
    params: {
      idempotencyKey: string;
      dispatchId: string;
      settledAt: Date;
      paidAmountTnd?: string;
      notes?: string;
      lines: SettlementLineInput[];
    },
    actor: DistributionActor,
  ) {
    const lines = normalizeSettlementLines(params.lines);

    return this.runIdempotentCommand(
      `distributor_settlement.post.${params.dispatchId}`,
      params.idempotencyKey,
      {
        ...params,
        lines: lines.map((line) => ({
          dispatchLineId: line.dispatchLineId,
          soldQuantity: line.soldQuantity.toFixed(6),
          returnedQuantity: line.returnedQuantity.toFixed(6),
          unaccountedQuantity: line.unaccountedQuantity.toFixed(6),
          unitPriceTnd: line.unitPriceTnd.toFixed(3),
        })),
      },
      async (tx) => {
        // Serializes concurrent settlements of the same dispatch so a
        // quantity can never be classified twice.
        await tx.$queryRaw`SELECT "id" FROM "distributor_dispatches" WHERE "id" = ${params.dispatchId} FOR UPDATE`;

        const dispatch = await tx.distributorDispatch.findUnique({
          where: {
            id: params.dispatchId,
          },
          include: {
            lines: true,
          },
        });

        if (!dispatch) {
          throw new AppError({
            statusCode: 404,
            code: "DISPATCH_NOT_FOUND",
            message: "Bon de livraison introuvable.",
          });
        }

        if (dispatch.status !== DistributorDispatchStatus.OPEN) {
          throw new AppError({
            statusCode: 409,
            code: "DISPATCH_NOT_OPEN",
            message: "Ce bon de livraison est deja solde.",
          });
        }

        const lineRows = lines.map((line) => {
          const dispatchLine = dispatch.lines.find(
            (candidate) => candidate.id === line.dispatchLineId,
          );

          if (!dispatchLine) {
            throw new AppError({
              statusCode: 400,
              code: "DISPATCH_LINE_REQUIRED",
              message: "Chaque ligne doit viser une ligne du bon de livraison.",
            });
          }

          const classified = line.soldQuantity
            .plus(line.returnedQuantity)
            .plus(line.unaccountedQuantity);
          const available = stillHeldQuantity(dispatchLine);

          // DST-022: a dispatched quantity cannot be settled twice.
          if (classified.greaterThan(available)) {
            throw new AppError({
              statusCode: 400,
              code: "SETTLEMENT_EXCEEDS_HELD_QUANTITY",
              message:
                "La quantite reglee depasse la quantite encore detenue par le distributeur.",
            });
          }

          return {
            ...line,
            dispatchLine,
            lineTotalTnd: line.soldQuantity
              .mul(line.unitPriceTnd)
              .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP),
          };
        });
        const totalTnd = sumDecimals(
          lineRows.map((line) => line.lineTotalTnd),
          3,
        );
        // DST-017: a settlement may be paid now or left as receivable, so an
        // omitted amount means nothing was collected.
        const paidAmountTnd =
          params.paidAmountTnd === undefined
            ? new Prisma.Decimal(0)
            : parseNonNegativeMoney(params.paidAmountTnd);

        if (paidAmountTnd.greaterThan(totalTnd)) {
          throw new AppError({
            statusCode: 400,
            code: "DISTRIBUTOR_OVERPAYMENT_REJECTED",
            message: "Le paiement ne peut pas depasser le montant vendu.",
          });
        }

        const remainingDueTnd = totalTnd
          .minus(paidAmountTnd)
          .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP);
        const settlement = await tx.distributorSettlement.create({
          data: {
            reference: await nextReference(
              tx,
              "distributor_settlement_reference_seq",
              "REG",
            ),
            distributorId: dispatch.distributorId,
            dispatchId: dispatch.id,
            settledAt: params.settledAt,
            totalTnd: totalTnd.toFixed(3),
            paidAmountTnd: paidAmountTnd.toFixed(3),
            remainingDueTnd: remainingDueTnd.toFixed(3),
            paymentState: derivePaymentState(totalTnd, paidAmountTnd),
            notes: emptyToNull(params.notes),
            postedAt: params.settledAt,
            postedByUserId: actor.actorUserId,
            correlationId: actor.correlationId,
            lines: {
              createMany: {
                data: lineRows.map((line) => ({
                  dispatchLineId: line.dispatchLineId,
                  productId: line.dispatchLine.productId,
                  unitId: line.dispatchLine.unitId,
                  soldQuantity: line.soldQuantity.toFixed(6),
                  returnedQuantity: line.returnedQuantity.toFixed(6),
                  unaccountedQuantity: line.unaccountedQuantity.toFixed(6),
                  unitPriceTnd: line.unitPriceTnd.toFixed(3),
                  lineTotalTnd: line.lineTotalTnd.toFixed(3),
                  productNameSnapshot: line.dispatchLine.productNameSnapshot,
                  unitNameSnapshot: line.dispatchLine.unitNameSnapshot,
                })),
              },
            },
          },
        });

        for (const line of lineRows) {
          await tx.distributorDispatchLine.update({
            where: {
              id: line.dispatchLineId,
            },
            data: {
              settledSoldQuantity: new Prisma.Decimal(
                line.dispatchLine.settledSoldQuantity,
              )
                .plus(line.soldQuantity)
                .toFixed(6),
              returnedQuantity: new Prisma.Decimal(
                line.dispatchLine.returnedQuantity,
              )
                .plus(line.returnedQuantity)
                .toFixed(6),
              unaccountedQuantity: new Prisma.Decimal(
                line.dispatchLine.unaccountedQuantity,
              )
                .plus(line.unaccountedQuantity)
                .toFixed(6),
            },
          });
        }

        // DST-017: only the sold quantity is recognized.
        if (totalTnd.greaterThan(0)) {
          await tx.distributorLedgerEntry.create({
            data: {
              distributorId: dispatch.distributorId,
              settlementId: settlement.id,
              entryType: DistributorLedgerEntryType.SETTLEMENT_RECEIVABLE,
              amountTnd: totalTnd.toFixed(3),
              occurredAt: params.settledAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            },
          });
        }

        if (paidAmountTnd.greaterThan(0)) {
          const payment = await tx.distributorPayment.create({
            data: {
              distributorId: dispatch.distributorId,
              amountTnd: paidAmountTnd.toFixed(3),
              paidAt: params.settledAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
              allocations: {
                createMany: {
                  data: [
                    {
                      settlementId: settlement.id,
                      amountTnd: paidAmountTnd.toFixed(3),
                    },
                  ],
                },
              },
            },
          });

          await tx.distributorLedgerEntry.create({
            data: {
              distributorId: dispatch.distributorId,
              settlementId: settlement.id,
              paymentId: payment.id,
              entryType: DistributorLedgerEntryType.PAYMENT,
              amountTnd: paidAmountTnd.negated().toFixed(3),
              occurredAt: params.settledAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            },
          });
        }

        // DST-018: returned quantity re-enters main saleable stock. Sold
        // quantity left main stock at dispatch, so it moves nothing here, and
        // unaccounted quantity stays a discrepancy with no stock effect.
        const returnedRows = lineRows
          .filter((line) => line.returnedQuantity.greaterThan(0))
          .map((line) => ({
            productId: line.dispatchLine.productId,
            unitId: line.dispatchLine.unitId,
            quantity: line.returnedQuantity,
            productNameSnapshot: line.dispatchLine.productNameSnapshot,
            unitNameSnapshot: line.dispatchLine.unitNameSnapshot,
          }));

        await writeStockMovements(tx, {
          rows: returnedRows,
          movementType: InventoryMovementType.DISTRIBUTOR_RETURN_IN,
          sourceType: "DISTRIBUTOR_SETTLEMENT",
          sourceId: settlement.id,
          reason: `Retour consignation ${settlement.reference}`,
          occurredAt: params.settledAt,
          signedQuantity: (quantity) => quantity,
          actor,
        });

        // A dispatch closes once nothing is still held.
        const refreshedLines = await tx.distributorDispatchLine.findMany({
          where: {
            dispatchId: dispatch.id,
          },
        });
        const stillHeld = refreshedLines.some((line) =>
          stillHeldQuantity(line).greaterThan(0),
        );

        if (!stillHeld) {
          await tx.distributorDispatch.update({
            where: {
              id: dispatch.id,
            },
            data: {
              status: DistributorDispatchStatus.CLOSED,
              version: {
                increment: 1,
              },
            },
          });
        }

        const result = await tx.distributorSettlement.findUniqueOrThrow({
          where: {
            id: settlement.id,
          },
          include: {
            distributor: true,
            lines: true,
          },
        });

        await auditWithClient(tx, {
          actor,
          action: "distributor_settlement.post",
          entity: "distributor_settlement",
          targetId: result.id,
          after: result,
        });

        return { settlement: result };
      },
    );
  }

  /// DST-014 and DST-021. Still-held quantity is what the distributor still
  /// has; unaccounted quantity stays visible as a discrepancy for manual
  /// follow-up and never becomes automatic debt.
  public async listCustody(params: { distributorId?: string }) {
    const lines = await this.prisma.distributorDispatchLine.findMany({
      where: {
        dispatch: {
          ...(params.distributorId
            ? { distributorId: params.distributorId }
            : {}),
        },
      },
      include: {
        dispatch: {
          include: {
            distributor: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }],
    });
    const held = lines
      .map((line) => ({
        ...withCustody(line),
        dispatchReference: line.dispatch.reference,
        dispatchedAt: line.dispatch.dispatchedAt,
        distributorId: line.dispatch.distributorId,
        distributorName: line.dispatch.distributor.name,
      }))
      .filter(
        (line) =>
          new Prisma.Decimal(line.stillHeldQuantity).greaterThan(0) ||
          new Prisma.Decimal(line.unaccountedQuantity).greaterThan(0),
      );

    return {
      items: held,
      discrepancies: held.filter((line) =>
        new Prisma.Decimal(line.unaccountedQuantity).greaterThan(0),
      ),
    };
  }

  /// DST-025 to DST-028. A payment reduces the receivable, never touches
  /// custody, and never recognizes revenue a second time.
  public async createDistributorPayment(
    params: {
      idempotencyKey: string;
      distributorId: string;
      paidAt: Date;
      amountTnd: string;
      reference?: string;
      notes?: string;
      allocations?: DistributorAllocationInput[];
    },
    actor: DistributionActor,
  ) {
    const amountTnd = parsePositiveMoney(params.amountTnd);
    const allocations = params.allocations ?? [];

    return this.runIdempotentCommand(
      `distributor_payment.create.${params.distributorId}`,
      params.idempotencyKey,
      {
        ...params,
        amountTnd: amountTnd.toFixed(3),
      },
      async (tx) => {
        const distributor = await tx.distributor.findUnique({
          where: {
            id: params.distributorId,
          },
        });

        if (!distributor) {
          throw new AppError({
            statusCode: 404,
            code: "DISTRIBUTOR_NOT_FOUND",
            message: "Distributeur introuvable.",
          });
        }

        const ledgerEntries = await tx.distributorLedgerEntry.findMany({
          where: {
            distributorId: params.distributorId,
          },
        });
        const currentBalance = sumDecimals(
          ledgerEntries.map((entry) => new Prisma.Decimal(entry.amountTnd)),
          3,
        );

        if (!currentBalance.greaterThan(0)) {
          throw new AppError({
            statusCode: 400,
            code: "DISTRIBUTOR_BALANCE_NOT_DUE",
            message: "Ce distributeur n'a pas de solde a payer.",
          });
        }

        if (amountTnd.greaterThan(currentBalance)) {
          throw new AppError({
            statusCode: 400,
            code: "DISTRIBUTOR_OVERPAYMENT_REJECTED",
            message: "Le paiement ne peut pas depasser le solde distributeur.",
          });
        }

        const allocationRows = validateAllocations({
          amountTnd,
          allocations,
          ledgerEntries,
        });
        const payment = await tx.distributorPayment.create({
          data: {
            distributorId: params.distributorId,
            amountTnd: amountTnd.toFixed(3),
            paidAt: params.paidAt,
            reference: emptyToNull(params.reference),
            notes: emptyToNull(params.notes),
            actorUserId: actor.actorUserId,
            correlationId: actor.correlationId,
            ...(allocationRows.length > 0
              ? {
                  allocations: {
                    createMany: {
                      data: allocationRows.map((allocation) => ({
                        saleId: allocation.saleId ?? null,
                        settlementId: allocation.settlementId ?? null,
                        amountTnd: allocation.amountTnd.toFixed(3),
                      })),
                    },
                  },
                }
              : {}),
          },
        });

        if (allocationRows.length > 0) {
          for (const allocation of allocationRows) {
            await tx.distributorLedgerEntry.create({
              data: {
                distributorId: params.distributorId,
                saleId: allocation.saleId ?? null,
                settlementId: allocation.settlementId ?? null,
                paymentId: payment.id,
                entryType: DistributorLedgerEntryType.PAYMENT,
                amountTnd: allocation.amountTnd.negated().toFixed(3),
                occurredAt: params.paidAt,
                actorUserId: actor.actorUserId,
                correlationId: actor.correlationId,
              },
            });
          }
        } else {
          await tx.distributorLedgerEntry.create({
            data: {
              distributorId: params.distributorId,
              paymentId: payment.id,
              entryType: DistributorLedgerEntryType.PAYMENT,
              amountTnd: amountTnd.negated().toFixed(3),
              occurredAt: params.paidAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            },
          });
        }

        await auditWithClient(tx, {
          actor,
          action: "distributor_payment.create",
          entity: "distributor_payment",
          targetId: payment.id,
          after: { payment, allocations: allocationRows },
        });

        return {
          payment,
          allocations: allocationRows.map((allocation) => ({
            saleId: allocation.saleId,
            settlementId: allocation.settlementId,
            amountTnd: allocation.amountTnd.toFixed(3),
          })),
        };
      },
    );
  }

  public async listDistributorPayments(params: {
    distributorId?: string;
    page: number;
    pageSize: number;
  }) {
    const where = {
      ...(params.distributorId ? { distributorId: params.distributorId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.distributorPayment.findMany({
        where,
        include: {
          distributor: true,
          allocations: true,
        },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.distributorPayment.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  /// DST-027: balances are reconstructed from ledger entries rather than
  /// stored on the distributor.
  public async listDistributorBalances(params: {
    page: number;
    pageSize: number;
  }) {
    const distributors = await this.prisma.distributor.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    });
    const distributorIds = distributors.map((distributor) => distributor.id);
    const [total, ledgerEntries] = await this.prisma.$transaction([
      this.prisma.distributor.count(),
      this.prisma.distributorLedgerEntry.findMany({
        where: {
          distributorId: {
            in: distributorIds,
          },
        },
      }),
    ]);

    return paginated(
      distributors.map((distributor) => ({
        distributor,
        balanceTnd: sumDecimals(
          ledgerEntries
            .filter((entry) => entry.distributorId === distributor.id)
            .map((entry) => new Prisma.Decimal(entry.amountTnd)),
          3,
        ).toFixed(3),
      })),
      total,
      params,
    );
  }

  public async getDistributorStatement(distributorId: string) {
    const distributor = await this.findDistributorOrThrow(distributorId);
    const [ledgerEntries, sales, settlements, payments] =
      await this.prisma.$transaction([
        this.prisma.distributorLedgerEntry.findMany({
          where: {
            distributorId,
          },
          orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
        }),
        this.prisma.distributorSale.findMany({
          where: {
            distributorId,
          },
          include: {
            lines: true,
          },
          orderBy: [{ soldAt: "desc" }],
        }),
        this.prisma.distributorSettlement.findMany({
          where: {
            distributorId,
          },
          include: {
            lines: true,
          },
          orderBy: [{ settledAt: "desc" }],
        }),
        this.prisma.distributorPayment.findMany({
          where: {
            distributorId,
          },
          include: {
            allocations: true,
          },
          orderBy: [{ paidAt: "desc" }],
        }),
      ]);

    return {
      distributor,
      balanceTnd: sumDecimals(
        ledgerEntries.map((entry) => new Prisma.Decimal(entry.amountTnd)),
        3,
      ).toFixed(3),
      sales: sales.map((sale) => ({
        ...sale,
        balanceTnd: documentBalance(ledgerEntries, { saleId: sale.id }).toFixed(
          3,
        ),
      })),
      settlements: settlements.map((settlement) => ({
        ...settlement,
        balanceTnd: documentBalance(ledgerEntries, {
          settlementId: settlement.id,
        }).toFixed(3),
      })),
      ledgerEntries,
      payments,
    };
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

function normalizeSettlementLines(lines: SettlementLineInput[]) {
  if (lines.length === 0) {
    throw new AppError({
      statusCode: 400,
      code: "SETTLEMENT_LINES_REQUIRED",
      message: "Ajoutez au moins une ligne au reglement.",
    });
  }

  const normalized = lines.map((line) => ({
    dispatchLineId: line.dispatchLineId,
    soldQuantity: parseNonNegativeQuantity(line.soldQuantity ?? "0"),
    returnedQuantity: parseNonNegativeQuantity(line.returnedQuantity ?? "0"),
    unaccountedQuantity: parseNonNegativeQuantity(
      line.unaccountedQuantity ?? "0",
    ),
    unitPriceTnd: parseNonNegativeMoney(line.unitPriceTnd),
  }));

  if (findDuplicate(normalized.map((line) => line.dispatchLineId))) {
    throw new AppError({
      statusCode: 400,
      code: "DUPLICATE_SETTLEMENT_LINE",
      message: "Une ligne du bon ne peut apparaitre qu'une seule fois.",
    });
  }

  const classifiesSomething = normalized.some((line) =>
    line.soldQuantity
      .plus(line.returnedQuantity)
      .plus(line.unaccountedQuantity)
      .greaterThan(0),
  );

  if (!classifiesSomething) {
    throw new AppError({
      statusCode: 400,
      code: "SETTLEMENT_QUANTITY_REQUIRED",
      message: "Indiquez au moins une quantite vendue, retournee ou manquante.",
    });
  }

  return normalized;
}

function normalizeDispatchLines(
  lines: Array<{ productId: string; quantity: string }>,
) {
  if (lines.length === 0) {
    throw new AppError({
      statusCode: 400,
      code: "DISPATCH_LINES_REQUIRED",
      message: "Ajoutez au moins une ligne au bon de livraison.",
    });
  }

  const normalized = lines.map((line) => ({
    productId: line.productId,
    quantity: parsePositiveQuantity(line.quantity),
  }));

  if (findDuplicate(normalized.map((line) => line.productId))) {
    throw new AppError({
      statusCode: 400,
      code: "DUPLICATE_DISPATCH_LINE",
      message: "Un produit ne peut apparaitre qu'une seule fois.",
    });
  }

  return normalized;
}

async function buildDispatchLines(
  client: Prisma.TransactionClient,
  lines: Array<{ productId: string; quantity: Prisma.Decimal }>,
) {
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
      productNameSnapshot: product.name,
      unitNameSnapshot: product.baseUnit.name,
      isStockable: product.isStockable,
    };
  });
}

/// Still-held quantity is always derived, never stored, so custody cannot
/// drift from what was dispatched and classified.
function withCustody<
  TLine extends {
    dispatchedQuantity: Prisma.Decimal;
    settledSoldQuantity: Prisma.Decimal;
    returnedQuantity: Prisma.Decimal;
    unaccountedQuantity: Prisma.Decimal;
  },
>(line: TLine) {
  return {
    ...line,
    stillHeldQuantity: stillHeldQuantity(line).toFixed(6),
  };
}

function stillHeldQuantity(line: {
  dispatchedQuantity: Prisma.Decimal;
  settledSoldQuantity: Prisma.Decimal;
  returnedQuantity: Prisma.Decimal;
  unaccountedQuantity: Prisma.Decimal;
}): Prisma.Decimal {
  return new Prisma.Decimal(line.dispatchedQuantity)
    .minus(line.settledSoldQuantity)
    .minus(line.returnedQuantity)
    .minus(line.unaccountedQuantity)
    .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
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

interface LedgerEntrySlice {
  saleId: string | null;
  settlementId: string | null;
  amountTnd: Prisma.Decimal | string;
}

/// A document balance is what that sale or settlement still owes: its
/// receivable entry less every payment allocated to it.
function documentBalance(
  entries: LedgerEntrySlice[],
  target: { saleId?: string; settlementId?: string },
): Prisma.Decimal {
  return sumDecimals(
    entries
      .filter((entry) =>
        target.saleId
          ? entry.saleId === target.saleId
          : entry.settlementId === target.settlementId,
      )
      .map((entry) => new Prisma.Decimal(entry.amountTnd)),
    3,
  );
}

function validateAllocations(params: {
  amountTnd: Prisma.Decimal;
  allocations: DistributorAllocationInput[];
  ledgerEntries: LedgerEntrySlice[];
}) {
  if (params.allocations.length === 0) {
    return [];
  }

  const allocations = params.allocations.map((allocation) => {
    if (Boolean(allocation.saleId) === Boolean(allocation.settlementId)) {
      throw new AppError({
        statusCode: 400,
        code: "ALLOCATION_TARGET_REQUIRED",
        message:
          "Chaque allocation doit viser soit une vente directe, soit un reglement.",
      });
    }

    return {
      saleId: allocation.saleId,
      settlementId: allocation.settlementId,
      amountTnd: parsePositiveMoney(allocation.amountTnd),
    };
  });

  if (
    findDuplicate(
      allocations.map(
        (allocation) => allocation.saleId ?? allocation.settlementId ?? "",
      ),
    )
  ) {
    throw new AppError({
      statusCode: 400,
      code: "DUPLICATE_DISTRIBUTOR_ALLOCATION",
      message: "Un document ne peut etre alloue qu'une seule fois.",
    });
  }

  const allocationTotal = sumDecimals(
    allocations.map((allocation) => allocation.amountTnd),
    3,
  );

  if (!allocationTotal.equals(params.amountTnd)) {
    throw new AppError({
      statusCode: 400,
      code: "PAYMENT_ALLOCATION_TOTAL_MISMATCH",
      message: "Les allocations doivent correspondre au montant paye.",
    });
  }

  for (const allocation of allocations) {
    const balance = documentBalance(params.ledgerEntries, allocation);

    if (allocation.amountTnd.greaterThan(balance)) {
      throw new AppError({
        statusCode: 400,
        code: "PAYMENT_ALLOCATION_EXCEEDS_DOCUMENT_BALANCE",
        message: "Une allocation depasse le solde du document.",
      });
    }
  }

  return allocations;
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

function parseNonNegativeQuantity(value: string): Prisma.Decimal {
  const decimal = new Prisma.Decimal(value);

  if (decimal.lessThan(0)) {
    throw new AppError({
      statusCode: 400,
      code: "NON_NEGATIVE_QUANTITY_REQUIRED",
      message: "La quantite doit etre positive ou nulle.",
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
      code: "VERSION_CONFLICT",
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
