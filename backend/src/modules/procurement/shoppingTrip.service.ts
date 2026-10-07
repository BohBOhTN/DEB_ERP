import {
  Prisma,
  type PrismaClient,
  type PurchasePaymentTerms,
} from "@prisma/client";
import { AppError } from "../../shared/appError.js";
import { runIdempotentCommand } from "../../shared/idempotency.js";
import { businessDateOf } from "../../shared/listQuery.js";
import { messages } from "../../shared/messages.js";
import type { ExpensesService } from "../expenses/expenses.service.js";
import {
  assertPurchaseInput,
  type ProcurementActor,
  type ProcurementService,
  type PurchaseLineInput,
} from "./procurement.service.js";

/// Issue 018, DEC-V2-009. A shopping trip is one screen and one validation
/// over two documents that stay what they are: the raw materials become a
/// purchase, created and posted as `postPurchase` does (stock, payable,
/// payment at posting); the other goods bought at the same store become
/// expenses, posted on the spot, dated the same day and linked to the store
/// and the purchase. Both happen in one transaction under one idempotency
/// key: an expense that fails takes the purchase down with it.

export interface ShoppingTripExpenseInput {
  categoryId: string;
  description: string;
  amountTnd: string;
}

export interface ShoppingTripInput {
  supplierId: string;
  tripDate: Date;
  supplierReference?: string;
  notes?: string;
  /// Absent when the trip bought no raw material: the expenses alone are
  /// recorded.
  purchase?: {
    paymentTerms: PurchasePaymentTerms;
    paidAmountTnd: string;
    dueDate?: Date;
    lines: PurchaseLineInput[];
  };
  expenses: ShoppingTripExpenseInput[];
}

const positiveMoneyPattern = /^\d+(\.\d{1,3})?$/;

export class ShoppingTripService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly procurement: ProcurementService,
    private readonly expenses: ExpensesService,
  ) {}

  public async post(
    params: ShoppingTripInput & { idempotencyKey: string },
    actor: ProcurementActor,
  ) {
    const { idempotencyKey, ...input } = params;
    assertShoppingTripInput(input);

    return runIdempotentCommand({
      prisma: this.prisma,
      scope: "shopping_trip.post",
      key: idempotencyKey,
      payload: input,
      execute: async (tx) => {
        const supplier = await tx.supplier.findFirst({
          where: { id: input.supplierId, isActive: true },
        });

        if (!supplier) {
          throw new AppError({
            statusCode: 400,
            code: "ACTIVE_SUPPLIER_REQUIRED",
            message: "Un fournisseur actif est requis.",
          });
        }

        // Every category is checked before anything is written, so the
        // form hears about all of its expense lines at once.
        await assertExpenseCategories(tx, input.expenses);

        let purchaseId: string | null = null;
        if (input.purchase) {
          const draft = await this.procurement.createPurchaseWith(
            tx,
            {
              supplierId: supplier.id,
              purchaseDate: input.tripDate,
              supplierReference: input.supplierReference,
              paymentTerms: input.purchase.paymentTerms,
              paidAmountTnd: input.purchase.paidAmountTnd,
              dueDate: input.purchase.dueDate,
              notes: input.notes,
              lines: input.purchase.lines,
            },
            actor,
          );
          await this.procurement.postPurchaseWith(tx, draft.id, actor);
          purchaseId = draft.id;
        }

        const expenses = [];
        for (const line of input.expenses) {
          const { expense } = await this.expenses.createExpenseWith(
            tx,
            {
              categoryId: line.categoryId,
              expenseDate: input.tripDate,
              amountTnd: line.amountTnd,
              description: line.description,
              externalReference: input.supplierReference,
              supplierId: supplier.id,
              purchaseId: purchaseId ?? undefined,
              post: true,
            },
            actor,
          );
          expenses.push(expense);
        }

        // Read back once the expenses exist, so the answer is the purchase
        // page's: payment state and the other goods of the trip.
        const purchase = purchaseId
          ? await this.procurement.getPurchaseWith(tx, purchaseId)
          : null;

        const purchaseTnd = new Prisma.Decimal(purchase?.totalTnd ?? 0);
        const paidOnPurchaseTnd = new Prisma.Decimal(
          purchase?.paidAmountTnd ?? 0,
        );
        const expensesTnd = expenses.reduce(
          (sum, expense) => sum.add(expense.amountTnd),
          new Prisma.Decimal(0),
        );
        const totals = {
          purchaseTnd: purchaseTnd.toFixed(3),
          expensesTnd: expensesTnd.toFixed(3),
          totalTnd: purchaseTnd.add(expensesTnd).toFixed(3),
          /// What left the till today: the part of the purchase paid at
          /// posting and the other goods, always paid on the spot.
          paidTodayTnd: paidOnPurchaseTnd.add(expensesTnd).toFixed(3),
        };

        // The purchase and each expense carry their own audit rows; this
        // one ties them together under the document the viewer can open.
        await tx.auditEvent.create({
          data: {
            actorUserId: actor.actorUserId,
            action: "shopping_trip.post",
            entity: purchase ? "purchase" : "expense",
            targetId: purchase?.id ?? expenses[0]?.id,
            after: {
              supplierId: supplier.id,
              supplierName: supplier.name,
              tripDate: input.tripDate.toISOString(),
              purchaseId: purchase?.id ?? null,
              expenseIds: expenses.map((expense) => expense.id),
              totals,
            },
            correlationId: actor.correlationId,
          },
        });

        return { purchase, expenses, totals };
      },
    });
  }
}

/// What the trip form can get wrong, refused before any lookup and answered
/// all at once on the fields concerned, the way issue 016 does for a
/// purchase: the purchase rules on `purchase.lines.N.*`, the expense rules
/// on `expenses.N.*`, the date on `tripDate`.
export function assertShoppingTripInput(
  input: ShoppingTripInput,
  now = new Date(),
): void {
  if (!input.purchase && input.expenses.length === 0) {
    throw new AppError({
      statusCode: 400,
      code: "SHOPPING_TRIP_EMPTY",
      message:
        "Ajoutez au moins une matière première, un produit de revente ou une dépense.",
    });
  }

  const fieldErrors: Record<string, string> = {};

  if (businessDateOf(input.tripDate) > businessDateOf(now)) {
    fieldErrors.tripDate = "La date ne peut pas être dans le futur.";
  }

  if (input.purchase) {
    try {
      assertPurchaseInput(
        {
          purchaseDate: input.tripDate,
          dueDate: input.purchase.dueDate,
          lines: input.purchase.lines,
        },
        now,
      );
    } catch (error) {
      if (!(error instanceof AppError) || !error.fieldErrors) {
        throw error;
      }
      for (const [field, message] of Object.entries(error.fieldErrors)) {
        if (field === "purchaseDate") {
          fieldErrors.tripDate = message;
        } else {
          fieldErrors[`purchase.${field}`] = message;
        }
      }
    }
  }

  input.expenses.forEach((line, index) => {
    if (!line.description.trim()) {
      fieldErrors[`expenses.${index}.description`] =
        "Un libellé est obligatoire.";
    }

    const amount = line.amountTnd.trim();
    if (!positiveMoneyPattern.test(amount) || Number(amount) <= 0) {
      fieldErrors[`expenses.${index}.amountTnd`] =
        "Le montant doit être supérieur à zéro.";
    }
  });

  if (Object.keys(fieldErrors).length > 0) {
    throw new AppError({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: messages.VALIDATION_ERROR,
      fieldErrors,
    });
  }
}

async function assertExpenseCategories(
  tx: Prisma.TransactionClient,
  lines: ShoppingTripExpenseInput[],
): Promise<void> {
  if (lines.length === 0) {
    return;
  }

  const categories = await tx.expenseCategory.findMany({
    where: {
      id: { in: [...new Set(lines.map((line) => line.categoryId))] },
      isActive: true,
    },
    select: { id: true },
  });
  const active = new Set(categories.map((category) => category.id));
  const fieldErrors: Record<string, string> = {};

  lines.forEach((line, index) => {
    if (!active.has(line.categoryId)) {
      fieldErrors[`expenses.${index}.categoryId`] =
        "Une catégorie de dépense active est obligatoire.";
    }
  });

  if (Object.keys(fieldErrors).length > 0) {
    throw new AppError({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: messages.VALIDATION_ERROR,
      fieldErrors,
    });
  }
}
