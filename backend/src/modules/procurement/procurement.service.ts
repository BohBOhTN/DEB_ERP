import {
  InventoryItemType,
  InventoryMovementType,
  Prisma,
  PurchasePaymentTerms,
  PurchaseStatus,
  SupplierLedgerEntryType,
  type PrismaClient,
} from "@prisma/client";
import { AppError } from "../../shared/appError.js";
import { runIdempotentCommand } from "../../shared/idempotency.js";
import {
  balanceOf,
  balancesByKey,
  pageWithCursor,
  statementDefaults,
  sumOrZero,
} from "../../shared/ledger.js";
import { normalizeName } from "../../shared/text.js";

export interface ProcurementActor {
  actorUserId: string;
  correlationId?: string;
}

export interface SupplierListParams {
  search?: string;
  isActive?: boolean;
  page: number;
  pageSize: number;
}

export interface PurchaseListParams {
  supplierId?: string;
  status?: PurchaseStatus;
  paymentTerms?: PurchasePaymentTerms;
  from?: Date;
  to?: Date;
  /// Section 18: purchases by due date. "overdue" is a due date in the past
  /// with money still owed; "upcoming" is a future due date still owed.
  dueState?: "OVERDUE" | "UPCOMING";
  asOf?: Date;
  page: number;
  pageSize: number;
}

export interface SupplierBalanceListParams {
  dueBefore?: Date;
  search?: string;
  /// `name` is the directory order; `balance` puts the largest payables
  /// first and only lists suppliers with ledger activity.
  sort?: "name" | "balance";
  minBalance?: string;
  page: number;
  pageSize: number;
}

export interface SupplierStatementParams {
  cursor?: string;
  limit?: number;
  from?: Date;
  to?: Date;
}

export interface SupplierPaymentListParams {
  supplierId?: string;
  page: number;
  pageSize: number;
}

export interface PurchaseLineInput {
  rawMaterialId: string;
  enteredUnitId: string;
  enteredQuantity: string;
  unitPriceTnd: string;
}

export interface SupplierPaymentAllocationInput {
  purchaseId: string;
  amountTnd: string;
}

export type ProcurementTransactionStep =
  | "idempotency_record_created"
  | "purchase_status_updated"
  | "purchase_stock_receipt_created"
  | "supplier_payable_created"
  | "supplier_payment_created"
  | "supplier_payment_ledger_created"
  | "purchase_post_audit_created"
  | "idempotency_response_saved";

export interface ProcurementTransactionHooks {
  afterStep?: (
    step: ProcurementTransactionStep,
    context: { scope?: string; purchaseId?: string },
  ) => Promise<void> | void;
}

export class ProcurementService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly transactionHooks: ProcurementTransactionHooks = {},
  ) {}

  public async listSuppliers(params: SupplierListParams) {
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
      this.prisma.supplier.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  public async createSupplier(
    params: {
      name: string;
      phone?: string;
      address?: string;
      taxIdentifier?: string;
      notes?: string;
    },
    actor: ProcurementActor,
  ) {
    const normalizedName = normalizeName(params.name);
    await this.assertActiveSupplierNameAvailable(normalizedName);

    const supplier = await this.prisma.supplier.create({
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
      action: "supplier.create",
      entity: "supplier",
      targetId: supplier.id,
      after: supplier,
    });

    return supplier;
  }

  public async updateSupplier(
    supplierId: string,
    params: {
      version: number;
      name?: string;
      phone?: string;
      address?: string;
      taxIdentifier?: string;
      notes?: string;
      isActive?: boolean;
    },
    actor: ProcurementActor,
  ) {
    const existing = await this.findSupplierOrThrow(supplierId);
    const normalizedName =
      params.name !== undefined ? normalizeName(params.name) : undefined;

    if ((params.isActive ?? existing.isActive) && normalizedName) {
      await this.assertActiveSupplierNameAvailable(normalizedName, existing.id);
    }

    if (params.isActive === true && normalizedName === undefined) {
      await this.assertActiveSupplierNameAvailable(
        existing.normalizedName,
        existing.id,
      );
    }

    const result = await this.prisma.supplier.updateMany({
      where: {
        id: supplierId,
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
    const supplier = await this.findSupplierOrThrow(supplierId);

    await this.audit({
      actor,
      action:
        params.isActive === undefined
          ? "supplier.update"
          : params.isActive
            ? "supplier.activate"
            : "supplier.deactivate",
      entity: "supplier",
      targetId: supplier.id,
      before: existing,
      after: supplier,
    });

    return supplier;
  }

  public async listPurchases(params: PurchaseListParams) {
    const asOf = params.asOf ?? new Date();
    const where = {
      ...(params.supplierId ? { supplierId: params.supplierId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.paymentTerms ? { paymentTerms: params.paymentTerms } : {}),
      ...(params.from || params.to
        ? {
            purchaseDate: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
      // Only a posted purchase that is not fully paid can be due. A draft
      // owes nothing yet and a cancelled one never will.
      ...(params.dueState
        ? {
            status: PurchaseStatus.POSTED,
            paymentTerms: {
              in: [PurchasePaymentTerms.PARTIAL, PurchasePaymentTerms.UNPAID],
            },
            dueDate:
              params.dueState === "OVERDUE" ? { lt: asOf } : { gte: asOf },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchase.findMany({
        where,
        include: {
          supplier: true,
          lines: true,
          payments: true,
        },
        // NFR-005: a stable sort, with the due list ordered by urgency.
        orderBy: params.dueState
          ? [{ dueDate: "asc" as const }, { id: "asc" as const }]
          : [{ purchaseDate: "desc" as const }, { id: "desc" as const }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.purchase.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  public async createPurchase(
    params: {
      supplierId: string;
      purchaseDate: Date;
      supplierReference?: string;
      paymentTerms: PurchasePaymentTerms;
      paidAmountTnd: string;
      dueDate?: Date;
      notes?: string;
      lines: PurchaseLineInput[];
    },
    actor: ProcurementActor,
  ) {
    const supplier = await this.assertActiveSupplier(params.supplierId);
    const lines = await this.buildPurchaseLines(params.lines, this.prisma);
    const total = sumDecimals(
      lines.map((line) => line.lineTotalTnd),
      3,
    );
    const paidAmount = parseMoney(params.paidAmountTnd);

    this.assertPaymentTerms({
      paymentTerms: params.paymentTerms,
      totalTnd: total,
      paidAmountTnd: paidAmount,
      dueDate: params.dueDate,
    });

    const purchase = await this.prisma.purchase.create({
      data: {
        supplierId: supplier.id,
        purchaseDate: params.purchaseDate,
        supplierReference: emptyToNull(params.supplierReference),
        paymentTerms: params.paymentTerms,
        dueDate: params.dueDate ?? null,
        totalTnd: total.toFixed(3),
        paidAmountTnd: paidAmount.toFixed(3),
        notes: emptyToNull(params.notes),
        createdByUserId: actor.actorUserId,
        updatedByUserId: actor.actorUserId,
        lines: {
          createMany: {
            data: lines.map((line) => ({
              rawMaterialId: line.rawMaterialId,
              enteredUnitId: line.enteredUnitId,
              baseUnitId: line.baseUnitId,
              enteredQuantity: line.enteredQuantity.toFixed(6),
              conversionFactorToBase: line.conversionFactorToBase.toFixed(6),
              normalizedQuantity: line.normalizedQuantity.toFixed(6),
              unitPriceTnd: line.unitPriceTnd.toFixed(3),
              lineTotalTnd: line.lineTotalTnd.toFixed(3),
              rawMaterialNameSnapshot: line.rawMaterialNameSnapshot,
              enteredUnitNameSnapshot: line.enteredUnitNameSnapshot,
              baseUnitNameSnapshot: line.baseUnitNameSnapshot,
            })),
          },
        },
      },
      include: purchaseInclude,
    });

    await this.audit({
      actor,
      action: "purchase.create",
      entity: "purchase",
      targetId: purchase.id,
      after: purchase,
    });

    return purchase;
  }

  public async postPurchase(
    purchaseId: string,
    params: {
      idempotencyKey: string;
    },
    actor: ProcurementActor,
  ) {
    return this.runIdempotentCommand(
      `purchase.post.${purchaseId}`,
      params.idempotencyKey,
      { purchaseId },
      async (tx) => {
        const purchase = await this.findPurchaseOrThrow(purchaseId, tx);

        if (purchase.status !== PurchaseStatus.DRAFT) {
          throw new AppError({
            statusCode: 409,
            code: "PURCHASE_NOT_DRAFT",
            message: "Seul un achat brouillon peut être confirmé.",
          });
        }

        if (!purchase.supplier.isActive) {
          throw new AppError({
            statusCode: 400,
            code: "ACTIVE_SUPPLIER_REQUIRED",
            message: "Un fournisseur actif est requis.",
          });
        }

        const location = await this.findMainLocation(tx);
        const postedAt = new Date();
        const updatedPurchase = await tx.purchase.update({
          where: {
            id: purchase.id,
          },
          data: {
            status: PurchaseStatus.POSTED,
            postedAt,
            postedByUserId: actor.actorUserId,
            correlationId: actor.correlationId,
            updatedByUserId: actor.actorUserId,
          },
          include: purchaseInclude,
        });
        await this.afterTransactionStep("purchase_status_updated", {
          purchaseId: purchase.id,
        });

        await tx.inventoryMovement.createMany({
          data: purchase.lines.map((line) => ({
            locationId: location.id,
            itemType: InventoryItemType.RAW_MATERIAL,
            rawMaterialId: line.rawMaterialId,
            unitId: line.baseUnitId,
            movementType: InventoryMovementType.PURCHASE_RECEIPT,
            quantityDelta: line.normalizedQuantity,
            itemNameSnapshot: line.rawMaterialNameSnapshot,
            unitNameSnapshot: line.baseUnitNameSnapshot,
            sourceType: "PURCHASE",
            sourceId: purchase.id,
            reason: "Achat fournisseur",
            occurredAt: postedAt,
            actorUserId: actor.actorUserId,
            correlationId: actor.correlationId,
          })),
        });
        await this.afterTransactionStep("purchase_stock_receipt_created", {
          purchaseId: purchase.id,
        });

        await tx.supplierLedgerEntry.create({
          data: {
            supplierId: purchase.supplierId,
            purchaseId: purchase.id,
            entryType: SupplierLedgerEntryType.PURCHASE_PAYABLE,
            amountTnd: purchase.totalTnd,
            occurredAt: postedAt,
            actorUserId: actor.actorUserId,
            correlationId: actor.correlationId,
          },
        });
        await this.afterTransactionStep("supplier_payable_created", {
          purchaseId: purchase.id,
        });

        let payment = null;
        if (new Prisma.Decimal(purchase.paidAmountTnd).greaterThan(0)) {
          payment = await tx.supplierPayment.create({
            data: {
              supplierId: purchase.supplierId,
              purchaseId: purchase.id,
              amountTnd: purchase.paidAmountTnd,
              paidAt: postedAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            },
          });
          await this.afterTransactionStep("supplier_payment_created", {
            purchaseId: purchase.id,
          });
          await tx.supplierLedgerEntry.create({
            data: {
              supplierId: purchase.supplierId,
              purchaseId: purchase.id,
              paymentId: payment.id,
              entryType: SupplierLedgerEntryType.PAYMENT,
              amountTnd: new Prisma.Decimal(purchase.paidAmountTnd)
                .negated()
                .toFixed(3),
              occurredAt: postedAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            },
          });
          await this.afterTransactionStep("supplier_payment_ledger_created", {
            purchaseId: purchase.id,
          });
        }

        await this.auditWithClient(tx, {
          actor,
          action: "purchase.post",
          entity: "purchase",
          targetId: purchase.id,
          before: purchase,
          after: updatedPurchase,
        });
        await this.afterTransactionStep("purchase_post_audit_created", {
          purchaseId: purchase.id,
        });

        return {
          purchase: updatedPurchase,
          payment,
        };
      },
    );
  }

  public async cancelPurchase(
    purchaseId: string,
    params: {
      idempotencyKey: string;
      reason: string;
    },
    actor: ProcurementActor,
  ) {
    const reason = requireReason(params.reason);

    return this.runIdempotentCommand(
      `purchase.cancel.${purchaseId}`,
      params.idempotencyKey,
      { purchaseId, reason },
      async (tx) => {
        const purchase = await this.findPurchaseOrThrow(purchaseId, tx);

        if (purchase.status !== PurchaseStatus.POSTED) {
          throw new AppError({
            statusCode: 409,
            code: "PURCHASE_NOT_POSTED",
            message: "Seul un achat confirmé peut être annulé.",
          });
        }

        const location = await this.findMainLocation(tx);
        const cancelledAt = new Date();
        const updatedPurchase = await tx.purchase.update({
          where: {
            id: purchase.id,
          },
          data: {
            status: PurchaseStatus.CANCELLED,
            cancelledAt,
            cancelledByUserId: actor.actorUserId,
            cancellationReason: reason,
            correlationId: actor.correlationId,
            updatedByUserId: actor.actorUserId,
          },
          include: purchaseInclude,
        });

        await tx.inventoryMovement.createMany({
          data: purchase.lines.map((line) => ({
            locationId: location.id,
            itemType: InventoryItemType.RAW_MATERIAL,
            rawMaterialId: line.rawMaterialId,
            unitId: line.baseUnitId,
            movementType: InventoryMovementType.REVERSAL,
            quantityDelta: new Prisma.Decimal(line.normalizedQuantity)
              .negated()
              .toFixed(6),
            itemNameSnapshot: line.rawMaterialNameSnapshot,
            unitNameSnapshot: line.baseUnitNameSnapshot,
            sourceType: "PURCHASE_CANCELLATION",
            sourceId: purchase.id,
            reason,
            occurredAt: cancelledAt,
            actorUserId: actor.actorUserId,
            correlationId: actor.correlationId,
          })),
        });

        await tx.supplierLedgerEntry.create({
          data: {
            supplierId: purchase.supplierId,
            purchaseId: purchase.id,
            entryType: SupplierLedgerEntryType.PURCHASE_REVERSAL,
            amountTnd: new Prisma.Decimal(purchase.totalTnd)
              .negated()
              .toFixed(3),
            occurredAt: cancelledAt,
            actorUserId: actor.actorUserId,
            correlationId: actor.correlationId,
          },
        });

        if (new Prisma.Decimal(purchase.paidAmountTnd).greaterThan(0)) {
          const paymentId = purchase.payments[0]?.id;

          await tx.supplierLedgerEntry.create({
            data: {
              supplierId: purchase.supplierId,
              purchaseId: purchase.id,
              ...(paymentId ? { paymentId } : {}),
              entryType: SupplierLedgerEntryType.PAYMENT_REVERSAL,
              amountTnd: new Prisma.Decimal(purchase.paidAmountTnd).toFixed(3),
              occurredAt: cancelledAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            },
          });
        }

        await this.auditWithClient(tx, {
          actor,
          action: "purchase.cancel",
          entity: "purchase",
          targetId: purchase.id,
          before: purchase,
          after: updatedPurchase,
        });

        return {
          purchase: updatedPurchase,
        };
      },
    );
  }

  /// Payables are summed by the database. The page comes from the supplier
  /// directory (name order) or from the ledger aggregate (balance order); only
  /// the page's suppliers are then enriched with their open purchases.
  public async listSupplierBalances(params: SupplierBalanceListParams) {
    const searchWhere = supplierSearchWhere(params.search);
    const minBalance =
      params.minBalance === undefined
        ? undefined
        : new Prisma.Decimal(params.minBalance);
    const byBalance = params.sort === "balance" || minBalance !== undefined;

    let suppliers: Awaited<ReturnType<typeof this.prisma.supplier.findMany>>;
    let total: number;

    if (byBalance) {
      const groups = await this.prisma.supplierLedgerEntry.groupBy({
        by: ["supplierId"],
        where: searchWhere ? { supplier: searchWhere } : {},
        _sum: { amountTnd: true },
        ...(minBalance !== undefined
          ? { having: { amountTnd: { _sum: { gte: minBalance } } } }
          : {}),
        orderBy: { _sum: { amountTnd: "desc" } },
      });
      total = groups.length;
      const pageIds = groups
        .slice(
          (params.page - 1) * params.pageSize,
          params.page * params.pageSize,
        )
        .map((group) => group.supplierId);
      const rows = await this.prisma.supplier.findMany({
        where: { id: { in: pageIds } },
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      suppliers = pageIds
        .map((id) => byId.get(id))
        .filter((row): row is NonNullable<typeof row> => row !== undefined);
    } else {
      const where = searchWhere ?? {};
      [suppliers, total] = await this.prisma.$transaction([
        this.prisma.supplier.findMany({
          where,
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
        }),
        this.prisma.supplier.count({ where }),
      ]);
    }

    const supplierIds = suppliers.map((supplier) => supplier.id);
    const [supplierTotals, purchaseTotals] = await Promise.all([
      this.prisma.supplierLedgerEntry.groupBy({
        by: ["supplierId"],
        where: { supplierId: { in: supplierIds } },
        _sum: { amountTnd: true },
      }),
      this.prisma.supplierLedgerEntry.groupBy({
        by: ["purchaseId"],
        where: { supplierId: { in: supplierIds }, purchaseId: { not: null } },
        _sum: { amountTnd: true },
      }),
    ]);
    const openPurchaseTotals = purchaseTotals.filter((row) =>
      sumOrZero(row._sum.amountTnd).greaterThan(0),
    );
    const openPurchases = await this.prisma.purchase.findMany({
      where: {
        id: { in: openPurchaseTotals.map((row) => row.purchaseId as string) },
        status: PurchaseStatus.POSTED,
        ...(params.dueBefore ? { dueDate: { lte: params.dueBefore } } : {}),
      },
      select: {
        id: true,
        supplierId: true,
        dueDate: true,
        totalTnd: true,
        status: true,
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    });
    const purchaseBalance = balancesByKey(
      openPurchaseTotals,
      (row) => row.purchaseId,
      (row) => row._sum.amountTnd,
    );
    const supplierBalance = balancesByKey(
      supplierTotals,
      (row) => row.supplierId,
      (row) => row._sum.amountTnd,
    );

    const items = suppliers.map((supplier) => {
      const supplierOpenPurchases = openPurchases
        .filter((purchase) => purchase.supplierId === supplier.id)
        .map((purchase) => {
          const balance = balanceOf(purchaseBalance, purchase.id);
          return {
            purchaseId: purchase.id,
            dueDate: purchase.dueDate,
            balanceTnd: balance.toFixed(3),
            paymentState: derivePaymentState(purchase, balance),
          };
        });

      return {
        supplier,
        balanceTnd: balanceOf(supplierBalance, supplier.id).toFixed(3),
        openPurchaseCount: supplierOpenPurchases.length,
        overduePurchaseCount: supplierOpenPurchases.filter(
          (purchase) => purchase.paymentState === "OVERDUE",
        ).length,
        openPurchases: supplierOpenPurchases,
      };
    });

    return paginated(items, total, params);
  }

  /// NFR-007: the statement states its range and calculation basis. Ledger
  /// entries page by cursor; purchases and payments show the most recent
  /// `limit` documents and flag when more exist.
  public async getSupplierStatement(
    supplierId: string,
    params: SupplierStatementParams = {},
  ) {
    const supplier = await this.findSupplierOrThrow(supplierId);
    const limit = Math.min(
      params.limit ?? statementDefaults.limit,
      statementDefaults.maxLimit,
    );
    const range = {
      ...(params.from ? { gte: params.from } : {}),
      ...(params.to ? { lte: params.to } : {}),
    };
    const inRange = params.from || params.to ? { occurredAt: range } : {};

    const [closingTotal, openingTotal, ledgerPage, payments, purchases] =
      await this.prisma.$transaction([
        this.prisma.supplierLedgerEntry.aggregate({
          where: {
            supplierId,
            ...(params.to ? { occurredAt: { lte: params.to } } : {}),
          },
          _sum: { amountTnd: true },
        }),
        this.prisma.supplierLedgerEntry.aggregate({
          where: {
            supplierId,
            ...(params.from ? { occurredAt: { lt: params.from } } : {}),
          },
          _sum: { amountTnd: true },
        }),
        this.prisma.supplierLedgerEntry.findMany({
          where: { supplierId, ...inRange },
          include: { purchase: true, payment: true },
          orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          take: limit + 1,
          ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
        }),
        this.prisma.supplierPayment.findMany({
          where: { supplierId },
          include: { allocations: true },
          orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
          take: limit + 1,
        }),
        this.prisma.purchase.findMany({
          where: {
            supplierId,
            status: { in: [PurchaseStatus.POSTED, PurchaseStatus.CANCELLED] },
          },
          orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
          take: limit + 1,
        }),
      ]);

    const ledger = pageWithCursor(ledgerPage, limit);
    const purchasesPage = purchases.slice(0, limit);
    const purchaseTotals = await this.prisma.supplierLedgerEntry.groupBy({
      by: ["purchaseId"],
      where: {
        supplierId,
        purchaseId: { in: purchasesPage.map((purchase) => purchase.id) },
      },
      _sum: { amountTnd: true },
    });
    const purchaseBalance = balancesByKey(
      purchaseTotals,
      (row) => row.purchaseId,
      (row) => row._sum.amountTnd,
    );
    const closingBalance = sumOrZero(closingTotal._sum.amountTnd);
    const openingBalance = params.from
      ? sumOrZero(openingTotal._sum.amountTnd)
      : new Prisma.Decimal(0);

    return {
      supplier,
      balanceTnd: closingBalance.toFixed(3),
      purchases: purchasesPage.map((purchase) => {
        const balance = balanceOf(purchaseBalance, purchase.id);
        return {
          ...purchase,
          balanceTnd: balance.toFixed(3),
          paymentState: derivePaymentState(purchase, balance),
        };
      }),
      ledgerEntries: ledger.items,
      payments: payments.slice(0, limit),
      meta: {
        limit,
        from: params.from ?? null,
        to: params.to ?? null,
        openingBalanceTnd: openingBalance.toFixed(3),
        closingBalanceTnd: closingBalance.toFixed(3),
        nextCursor: ledger.nextCursor,
        hasMorePurchases: purchases.length > limit,
        hasMorePayments: payments.length > limit,
        basis:
          "Solde = somme des écritures du grand livre fournisseur (achats validés moins paiements) jusqu'à la date de fin.",
      },
    };
  }

  public async listSupplierPayments(params: SupplierPaymentListParams) {
    const where = {
      ...(params.supplierId ? { supplierId: params.supplierId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplierPayment.findMany({
        where,
        include: {
          supplier: true,
          allocations: {
            include: {
              purchase: true,
            },
          },
        },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.supplierPayment.count({ where }),
    ]);

    return paginated(items, total, params);
  }

  public async createSupplierPayment(
    params: {
      idempotencyKey: string;
      supplierId: string;
      paidAt: Date;
      amountTnd: string;
      reference?: string;
      notes?: string;
      allocations?: SupplierPaymentAllocationInput[];
    },
    actor: ProcurementActor,
  ) {
    const amountTnd = parsePositiveMoney(params.amountTnd);
    const allocations = params.allocations ?? [];

    return this.runIdempotentCommand(
      `supplier_payment.create.${params.supplierId}`,
      params.idempotencyKey,
      {
        ...params,
        amountTnd: amountTnd.toFixed(3),
      },
      async (tx) => {
        const supplier = await tx.supplier.findUnique({
          where: {
            id: params.supplierId,
          },
        });

        if (!supplier) {
          throw new AppError({
            statusCode: 404,
            code: "SUPPLIER_NOT_FOUND",
            message: "Fournisseur introuvable.",
          });
        }

        const payable = await tx.supplierLedgerEntry.aggregate({
          where: { supplierId: params.supplierId },
          _sum: { amountTnd: true },
        });
        const currentBalance = sumOrZero(payable._sum.amountTnd);

        if (!currentBalance.greaterThan(0)) {
          throw new AppError({
            statusCode: 400,
            code: "SUPPLIER_BALANCE_NOT_DUE",
            message: "Ce fournisseur n'a pas de solde a payer.",
          });
        }

        if (amountTnd.greaterThan(currentBalance)) {
          throw new AppError({
            statusCode: 400,
            code: "SUPPLIER_OVERPAYMENT_REJECTED",
            message: "Le paiement ne peut pas dépasser le solde fournisseur.",
          });
        }

        const allocationRows = await this.validateSupplierPaymentAllocations(
          {
            supplierId: params.supplierId,
            amountTnd,
            allocations,
          },
          tx,
        );
        const payment = await tx.supplierPayment.create({
          data: {
            supplierId: params.supplierId,
            purchaseId:
              allocationRows.length === 1
                ? allocationRows[0]?.purchaseId
                : null,
            amountTnd: amountTnd.toFixed(3),
            paidAt: params.paidAt,
            reference: emptyToNull(params.reference),
            notes: emptyToNull(params.notes),
            actorUserId: actor.actorUserId,
            correlationId: actor.correlationId,
          },
        });

        if (allocationRows.length > 0) {
          await tx.supplierPaymentAllocation.createMany({
            data: allocationRows.map((allocation) => ({
              paymentId: payment.id,
              purchaseId: allocation.purchaseId,
              amountTnd: allocation.amountTnd.toFixed(3),
            })),
          });

          await tx.supplierLedgerEntry.createMany({
            data: allocationRows.map((allocation) => ({
              supplierId: params.supplierId,
              purchaseId: allocation.purchaseId,
              paymentId: payment.id,
              entryType: SupplierLedgerEntryType.PAYMENT,
              amountTnd: allocation.amountTnd.negated().toFixed(3),
              occurredAt: params.paidAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            })),
          });
        } else {
          await tx.supplierLedgerEntry.create({
            data: {
              supplierId: params.supplierId,
              paymentId: payment.id,
              entryType: SupplierLedgerEntryType.PAYMENT,
              amountTnd: amountTnd.negated().toFixed(3),
              occurredAt: params.paidAt,
              actorUserId: actor.actorUserId,
              correlationId: actor.correlationId,
            },
          });
        }

        await this.auditWithClient(tx, {
          actor,
          action: "supplier_payment.create",
          entity: "supplier_payment",
          targetId: payment.id,
          after: {
            payment,
            allocations: allocationRows,
          },
        });

        return {
          payment,
          allocations: allocationRows.map((allocation) => ({
            purchaseId: allocation.purchaseId,
            amountTnd: allocation.amountTnd.toFixed(3),
          })),
        };
      },
    );
  }

  private async findSupplierOrThrow(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: {
        id: supplierId,
      },
    });

    if (!supplier) {
      throw new AppError({
        statusCode: 404,
        code: "SUPPLIER_NOT_FOUND",
        message: "Fournisseur introuvable.",
      });
    }

    return supplier;
  }

  private async assertActiveSupplier(supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id: supplierId,
        isActive: true,
      },
    });

    if (!supplier) {
      throw new AppError({
        statusCode: 400,
        code: "ACTIVE_SUPPLIER_REQUIRED",
        message: "Un fournisseur actif est requis.",
      });
    }

    return supplier;
  }

  private async assertActiveSupplierNameAvailable(
    normalizedName: string,
    exceptId?: string,
  ): Promise<void> {
    const existing = await this.prisma.supplier.findFirst({
      where: {
        normalizedName,
        isActive: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });

    if (existing) {
      throw new AppError({
        statusCode: 409,
        code: "ACTIVE_SUPPLIER_NAME_NOT_UNIQUE",
        message: "Un fournisseur actif porte déjà ce nom.",
      });
    }
  }

  private async audit(params: {
    actor: ProcurementActor;
    action: string;
    entity: string;
    targetId: string;
    before?: unknown;
    after?: unknown;
  }): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: params.actor.actorUserId,
        action: params.action,
        entity: params.entity,
        targetId: params.targetId,
        correlationId: params.actor.correlationId,
        before: params.before ?? undefined,
        after: params.after ?? undefined,
      },
    });
  }

  private async auditWithClient(
    client: Prisma.TransactionClient,
    params: {
      actor: ProcurementActor;
      action: string;
      entity: string;
      targetId: string;
      before?: unknown;
      after?: unknown;
    },
  ): Promise<void> {
    await client.auditEvent.create({
      data: {
        actorUserId: params.actor.actorUserId,
        action: params.action,
        entity: params.entity,
        targetId: params.targetId,
        correlationId: params.actor.correlationId,
        before: params.before ?? undefined,
        after: params.after ?? undefined,
      },
    });
  }

  private async buildPurchaseLines(
    lines: PurchaseLineInput[],
    client: PrismaClient | Prisma.TransactionClient,
  ) {
    if (lines.length === 0) {
      throw new AppError({
        statusCode: 400,
        code: "PURCHASE_LINES_REQUIRED",
        message: "Au moins une ligne d'achat est requise.",
      });
    }

    // One lookup for every raw material on the document instead of one query
    // per line.
    const rawMaterials = await client.rawMaterial.findMany({
      where: {
        id: { in: [...new Set(lines.map((line) => line.rawMaterialId))] },
        isActive: true,
      },
      include: {
        baseUnit: true,
        conversions: {
          where: {
            isActive: true,
          },
          include: {
            unit: true,
          },
        },
      },
    });
    const rawMaterialById = new Map(
      rawMaterials.map((rawMaterial) => [rawMaterial.id, rawMaterial]),
    );

    return Promise.all(
      lines.map(async (line) => {
        const rawMaterial = rawMaterialById.get(line.rawMaterialId);

        if (!rawMaterial) {
          throw new AppError({
            statusCode: 400,
            code: "ACTIVE_RAW_MATERIAL_REQUIRED",
            message: "Une matière première active est requise.",
          });
        }

        const enteredQuantity = parseQuantity(line.enteredQuantity);
        const unitPriceTnd = parseMoney(line.unitPriceTnd);
        const conversion =
          line.enteredUnitId === rawMaterial.baseUnitId
            ? {
                unitId: rawMaterial.baseUnitId,
                factorToBase: new Prisma.Decimal(1),
                unitName: rawMaterial.baseUnit.name,
              }
            : rawMaterial.conversions.find(
                (candidate) =>
                  candidate.unitId === line.enteredUnitId &&
                  candidate.unit.isActive,
              );

        if (!conversion) {
          throw new AppError({
            statusCode: 400,
            code: "PURCHASE_UNIT_CONVERSION_REQUIRED",
            message: "Une conversion active est requise pour cette unité.",
          });
        }

        const factor = new Prisma.Decimal(conversion.factorToBase);
        const normalizedQuantity = enteredQuantity
          .mul(factor)
          .toDecimalPlaces(6);
        const lineTotalTnd = normalizedQuantity
          .mul(unitPriceTnd)
          .toDecimalPlaces(3);

        return {
          rawMaterialId: rawMaterial.id,
          enteredUnitId: line.enteredUnitId,
          baseUnitId: rawMaterial.baseUnitId,
          enteredQuantity,
          conversionFactorToBase: factor,
          normalizedQuantity,
          unitPriceTnd,
          lineTotalTnd,
          rawMaterialNameSnapshot: rawMaterial.name,
          enteredUnitNameSnapshot:
            line.enteredUnitId === rawMaterial.baseUnitId
              ? rawMaterial.baseUnit.name
              : "unitName" in conversion
                ? conversion.unitName
                : conversion.unit.name,
          baseUnitNameSnapshot: rawMaterial.baseUnit.name,
        };
      }),
    );
  }

  private assertPaymentTerms(params: {
    paymentTerms: PurchasePaymentTerms;
    totalTnd: Prisma.Decimal;
    paidAmountTnd: Prisma.Decimal;
    dueDate?: Date;
  }): void {
    if (params.totalTnd.lessThanOrEqualTo(0)) {
      throw new AppError({
        statusCode: 400,
        code: "POSITIVE_PURCHASE_TOTAL_REQUIRED",
        message: "Le total d'achat doit être positif.",
      });
    }

    if (params.paidAmountTnd.lessThan(0)) {
      throw new AppError({
        statusCode: 400,
        code: "PAID_AMOUNT_INVALID",
        message: "Le montant payé est invalide.",
      });
    }

    if (params.paidAmountTnd.greaterThan(params.totalTnd)) {
      throw new AppError({
        statusCode: 400,
        code: "PAID_AMOUNT_EXCEEDS_TOTAL",
        message: "Le montant payé ne peut pas dépasser le total.",
      });
    }

    const remaining = params.totalTnd.minus(params.paidAmountTnd);

    if (params.paymentTerms === PurchasePaymentTerms.PAID) {
      if (!remaining.equals(0) || params.dueDate) {
        throw new AppError({
          statusCode: 400,
          code: "PAID_PURCHASE_INVALID",
          message: "Un achat payé doit être réglé en totalité sans échéance.",
        });
      }
      return;
    }

    if (!params.dueDate) {
      throw new AppError({
        statusCode: 400,
        code: "DUE_DATE_REQUIRED",
        message: "Une échéance est requise lorsqu'un solde reste dû.",
      });
    }

    if (params.paymentTerms === PurchasePaymentTerms.UNPAID) {
      if (!params.paidAmountTnd.equals(0)) {
        throw new AppError({
          statusCode: 400,
          code: "UNPAID_PURCHASE_INVALID",
          message: "Un achat non payé ne doit pas avoir de paiement.",
        });
      }
      return;
    }

    if (
      !params.paidAmountTnd.greaterThan(0) ||
      !params.paidAmountTnd.lessThan(params.totalTnd)
    ) {
      throw new AppError({
        statusCode: 400,
        code: "PARTIAL_PURCHASE_INVALID",
        message: "Un achat partiel doit avoir un paiement entre zéro et total.",
      });
    }
  }

  private async findPurchaseOrThrow(
    purchaseId: string,
    client: PrismaClient | Prisma.TransactionClient,
  ) {
    const purchase = await client.purchase.findUnique({
      where: {
        id: purchaseId,
      },
      include: purchaseInclude,
    });

    if (!purchase) {
      throw new AppError({
        statusCode: 404,
        code: "PURCHASE_NOT_FOUND",
        message: "Achat introuvable.",
      });
    }

    return purchase;
  }

  private async findMainLocation(client: Prisma.TransactionClient) {
    const location = await client.stockLocation.findUnique({
      where: {
        code: "main",
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

  private async validateSupplierPaymentAllocations(
    params: {
      supplierId: string;
      amountTnd: Prisma.Decimal;
      allocations: SupplierPaymentAllocationInput[];
    },
    client: Prisma.TransactionClient,
  ) {
    if (params.allocations.length === 0) {
      return [];
    }

    const allocations = params.allocations.map((allocation) => ({
      purchaseId: allocation.purchaseId,
      amountTnd: parsePositiveMoney(allocation.amountTnd),
    }));
    const duplicatePurchaseId = findDuplicate(
      allocations.map((allocation) => allocation.purchaseId),
    );

    if (duplicatePurchaseId) {
      throw new AppError({
        statusCode: 400,
        code: "DUPLICATE_PAYMENT_ALLOCATION",
        message: "Une facture ne peut être allouée qu'une seule fois.",
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
        message: "Les allocations doivent correspondre au montant payé.",
      });
    }

    const purchases = await client.purchase.findMany({
      where: {
        id: {
          in: allocations.map((allocation) => allocation.purchaseId),
        },
        supplierId: params.supplierId,
        status: PurchaseStatus.POSTED,
      },
    });

    if (purchases.length !== allocations.length) {
      throw new AppError({
        statusCode: 400,
        code: "POSTED_PURCHASE_ALLOCATION_REQUIRED",
        message:
          "Chaque allocation doit viser un achat confirmé du fournisseur.",
      });
    }

    const purchaseTotals = await client.supplierLedgerEntry.groupBy({
      by: ["purchaseId"],
      where: {
        supplierId: params.supplierId,
        purchaseId: {
          in: allocations.map((allocation) => allocation.purchaseId),
        },
      },
      _sum: { amountTnd: true },
    });
    const purchaseBalance = balancesByKey(
      purchaseTotals,
      (row) => row.purchaseId,
      (row) => row._sum.amountTnd,
    );

    for (const allocation of allocations) {
      if (
        allocation.amountTnd.greaterThan(
          balanceOf(purchaseBalance, allocation.purchaseId),
        )
      ) {
        throw new AppError({
          statusCode: 400,
          code: "PAYMENT_ALLOCATION_EXCEEDS_PURCHASE_BALANCE",
          message: "Une allocation dépasse le solde de l'achat.",
        });
      }
    }

    return allocations;
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
      hooks: {
        afterRecordCreated: () =>
          this.afterTransactionStep("idempotency_record_created", { scope }),
        afterResponseSaved: () =>
          this.afterTransactionStep("idempotency_response_saved", { scope }),
      },
    });
  }

  private async afterTransactionStep(
    step: ProcurementTransactionStep,
    context: { scope?: string; purchaseId?: string },
  ): Promise<void> {
    await this.transactionHooks.afterStep?.(step, context);
  }
}

const purchaseInclude = {
  supplier: true,
  lines: true,
  payments: true,
  ledgerEntries: true,
} as const;

function parseQuantity(value: string): Prisma.Decimal {
  const trimmed = value.trim();

  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    throw new AppError({
      statusCode: 400,
      code: "POSITIVE_QUANTITY_REQUIRED",
      message: "La quantité doit être positive.",
    });
  }

  const decimal = new Prisma.Decimal(trimmed);
  if (!decimal.greaterThan(0)) {
    throw new AppError({
      statusCode: 400,
      code: "POSITIVE_QUANTITY_REQUIRED",
      message: "La quantité doit être positive.",
    });
  }

  return decimal;
}

function parseMoney(value: string): Prisma.Decimal {
  const trimmed = value.trim();

  if (!/^\d+(\.\d{1,3})?$/.test(trimmed)) {
    throw new AppError({
      statusCode: 400,
      code: "MONEY_AMOUNT_INVALID",
      message: "Le montant doit être en TND avec trois décimales maximum.",
    });
  }

  return new Prisma.Decimal(trimmed).toDecimalPlaces(3);
}

function parsePositiveMoney(value: string): Prisma.Decimal {
  const amount = parseMoney(value);

  if (!amount.greaterThan(0)) {
    throw new AppError({
      statusCode: 400,
      code: "POSITIVE_PAYMENT_AMOUNT_REQUIRED",
      message: "Le montant du paiement doit être positif.",
    });
  }

  return amount;
}

function sumDecimals(values: Prisma.Decimal[], decimalPlaces: number) {
  return values
    .reduce((total, value) => total.add(value), new Prisma.Decimal(0))
    .toDecimalPlaces(decimalPlaces);
}

function derivePaymentState(
  purchase: { totalTnd: unknown; dueDate: Date | null; status: PurchaseStatus },
  balance: Prisma.Decimal,
) {
  if (purchase.status === PurchaseStatus.CANCELLED) {
    return "CANCELLED";
  }

  if (balance.lessThanOrEqualTo(0)) {
    return "PAID";
  }

  if (
    purchase.dueDate &&
    purchase.dueDate.getTime() < startOfToday().getTime()
  ) {
    return "OVERDUE";
  }

  if (balance.lessThan(new Prisma.Decimal(purchase.totalTnd as string))) {
    return "PARTIALLY_PAID";
  }

  return "UNPAID";
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function findDuplicate(values: string[]): string | null {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      return value;
    }
    seen.add(value);
  }

  return null;
}

function assertVersionUpdated(count: number): void {
  if (count === 0) {
    throw new AppError({
      statusCode: 409,
      code: "VERSION_CONFLICT",
      message: "Les données ont changé. Actualisez puis réessayez.",
    });
  }
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

function emptyToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function paginated<TItem>(
  items: TItem[],
  total: number,
  params: SupplierListParams,
) {
  return {
    items,
    page: params.page,
    pageSize: params.pageSize,
    total,
    pageCount: Math.ceil(total / params.pageSize),
  };
}

function supplierSearchWhere(
  search: string | undefined,
): Prisma.SupplierWhereInput | undefined {
  const trimmed = search?.trim();
  if (!trimmed) {
    return undefined;
  }

  return {
    OR: [
      { normalizedName: { contains: normalizeName(trimmed) } },
      { phone: { contains: trimmed, mode: "insensitive" } },
      { taxIdentifier: { contains: trimmed, mode: "insensitive" } },
    ],
  };
}
