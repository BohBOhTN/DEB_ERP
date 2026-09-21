import {
  InventoryItemType,
  InventoryMovementType,
  Prisma,
  PurchasePaymentTerms,
  PurchaseStatus,
  SupplierLedgerEntryType,
  type PrismaClient,
} from "@prisma/client";
import { createHash } from "node:crypto";
import { AppError } from "../../shared/appError.js";
import { normalizeName } from "../catalog/catalog.service.js";

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
  page: number;
  pageSize: number;
}

export interface PurchaseLineInput {
  rawMaterialId: string;
  enteredUnitId: string;
  enteredQuantity: string;
  unitPriceTnd: string;
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
    const where = {
      ...(params.supplierId ? { supplierId: params.supplierId } : {}),
      ...(params.status ? { status: params.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchase.findMany({
        where,
        include: {
          supplier: true,
          lines: true,
          payments: true,
        },
        orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
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
            message: "Seul un achat brouillon peut etre confirme.",
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
            message: "Seul un achat confirme peut etre annule.",
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
        message: "Un fournisseur actif porte deja ce nom.",
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

    return Promise.all(
      lines.map(async (line) => {
        const rawMaterial = await client.rawMaterial.findFirst({
          where: {
            id: line.rawMaterialId,
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

        if (!rawMaterial) {
          throw new AppError({
            statusCode: 400,
            code: "ACTIVE_RAW_MATERIAL_REQUIRED",
            message: "Une matiere premiere active est requise.",
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
            message: "Une conversion active est requise pour cette unite.",
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
        message: "Le total d'achat doit etre positif.",
      });
    }

    if (params.paidAmountTnd.lessThan(0)) {
      throw new AppError({
        statusCode: 400,
        code: "PAID_AMOUNT_INVALID",
        message: "Le montant paye est invalide.",
      });
    }

    if (params.paidAmountTnd.greaterThan(params.totalTnd)) {
      throw new AppError({
        statusCode: 400,
        code: "PAID_AMOUNT_EXCEEDS_TOTAL",
        message: "Le montant paye ne peut pas depasser le total.",
      });
    }

    const remaining = params.totalTnd.minus(params.paidAmountTnd);

    if (params.paymentTerms === PurchasePaymentTerms.PAID) {
      if (!remaining.equals(0) || params.dueDate) {
        throw new AppError({
          statusCode: 400,
          code: "PAID_PURCHASE_INVALID",
          message: "Un achat paye doit etre regle en totalite sans echeance.",
        });
      }
      return;
    }

    if (!params.dueDate) {
      throw new AppError({
        statusCode: 400,
        code: "DUE_DATE_REQUIRED",
        message: "Une echeance est requise lorsqu'un solde reste du.",
      });
    }

    if (params.paymentTerms === PurchasePaymentTerms.UNPAID) {
      if (!params.paidAmountTnd.equals(0)) {
        throw new AppError({
          statusCode: 400,
          code: "UNPAID_PURCHASE_INVALID",
          message: "Un achat non paye ne doit pas avoir de paiement.",
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
        message: "Un achat partiel doit avoir un paiement entre zero et total.",
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
      await this.afterTransactionStep("idempotency_record_created", { scope });

      const response = await action(tx);
      await tx.idempotencyRecord.update({
        where: {
          scope_key: {
            scope,
            key,
          },
        },
        data: {
          response: toJsonValue(response),
        },
      });
      await this.afterTransactionStep("idempotency_response_saved", { scope });

      return response;
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
      message: "La quantite doit etre positive.",
    });
  }

  const decimal = new Prisma.Decimal(trimmed);
  if (!decimal.greaterThan(0)) {
    throw new AppError({
      statusCode: 400,
      code: "POSITIVE_QUANTITY_REQUIRED",
      message: "La quantite doit etre positive.",
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
      message: "Le montant doit etre en TND avec trois decimales maximum.",
    });
  }

  return new Prisma.Decimal(trimmed).toDecimalPlaces(3);
}

function sumDecimals(values: Prisma.Decimal[], decimalPlaces: number) {
  return values
    .reduce((total, value) => total.add(value), new Prisma.Decimal(0))
    .toDecimalPlaces(decimalPlaces);
}

function assertVersionUpdated(count: number): void {
  if (count === 0) {
    throw new AppError({
      statusCode: 409,
      code: "STALE_VERSION",
      message: "Les donnees ont change. Actualisez puis reessayez.",
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

function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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
