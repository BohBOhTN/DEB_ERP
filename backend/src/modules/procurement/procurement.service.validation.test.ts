import { type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  assertPurchaseInput,
  ProcurementService,
} from "./procurement.service.js";

/// Issue 016: what the purchase form can get wrong is refused before any
/// write, every error at once, each on the field it concerns, so the form
/// shows it where the user typed it instead of in a banner.
/// 5 October 2026, 10:00 in Tunis.
const now = new Date("2026-10-05T09:00:00.000Z");
const line = (
  rawMaterialId: string,
  enteredQuantity = "10",
  unitPriceTnd = "1.200",
) => ({
  rawMaterialId,
  enteredUnitId: "unit-kg",
  enteredQuantity,
  unitPriceTnd,
});
const fieldErrorsOf = (run: () => void): Record<string, string> => {
  try {
    run();
  } catch (error) {
    expect(error).toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    return (error as { fieldErrors: Record<string, string> }).fieldErrors;
  }
  return {};
};

describe("purchase input validation", () => {
  it("accepts a purchase of today with distinct materials", () => {
    expect(
      fieldErrorsOf(() =>
        assertPurchaseInput(
          {
            purchaseDate: new Date("2026-10-05T00:00:00.000Z"),
            dueDate: new Date("2026-10-05T00:00:00.000Z"),
            lines: [line("flour"), line("butter", "2.5", "18")],
          },
          now,
        ),
      ),
    ).toEqual({});
  });

  it("refuses the same material on two lines, on the second line", () => {
    expect(
      fieldErrorsOf(() =>
        assertPurchaseInput(
          {
            purchaseDate: new Date("2026-10-01T00:00:00.000Z"),
            lines: [line("flour"), line("butter"), line("flour", "5")],
          },
          now,
        ),
      ),
    ).toEqual({
      "lines.2.rawMaterialId":
        "Cette matière première est déjà sur une autre ligne.",
    });
  });

  it("refuses a zero or malformed quantity and unit price on their own fields", () => {
    expect(
      fieldErrorsOf(() =>
        assertPurchaseInput(
          {
            purchaseDate: new Date("2026-10-01T00:00:00.000Z"),
            lines: [
              line("flour", "0", "1.200"),
              line("butter", "2", "0"),
              line("sugar", "abc", "1,5"),
            ],
          },
          now,
        ),
      ),
    ).toEqual({
      "lines.0.enteredQuantity": "La quantité doit être supérieure à zéro.",
      "lines.1.unitPriceTnd": "Le prix unitaire doit être supérieur à zéro.",
      "lines.2.enteredQuantity": "La quantité doit être supérieure à zéro.",
      "lines.2.unitPriceTnd": "Le prix unitaire doit être supérieur à zéro.",
    });
  });

  it("refuses a purchase dated tomorrow and a due date before the purchase", () => {
    expect(
      fieldErrorsOf(() =>
        assertPurchaseInput(
          {
            purchaseDate: new Date("2026-10-06T00:00:00.000Z"),
            dueDate: new Date("2026-10-02T00:00:00.000Z"),
            lines: [line("flour")],
          },
          now,
        ),
      ),
    ).toEqual({
      purchaseDate: "La date d'achat ne peut pas être dans le futur.",
      dueDate: "L'échéance ne peut pas précéder la date d'achat.",
    });
  });

  it("reads the day in Tunis: late in the UTC evening is already tomorrow there", () => {
    // 23:30 UTC on the 5th is 00:30 on the 6th in Tunis.
    const lateEvening = new Date("2026-10-05T23:30:00.000Z");

    expect(
      fieldErrorsOf(() =>
        assertPurchaseInput(
          {
            purchaseDate: new Date("2026-10-06T00:00:00.000Z"),
            lines: [line("flour")],
          },
          lateEvening,
        ),
      ),
    ).toEqual({});
  });

  it("refuses a line whose total rounds to zero, before any write", async () => {
    const create = vi.fn();
    const prisma = {
      supplier: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "supplier-1", isActive: true }),
      },
      rawMaterial: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "salt",
            name: "Sel",
            baseUnitId: "unit-kg",
            baseUnit: { name: "Kilogramme" },
            conversions: [],
          },
        ]),
      },
      purchase: { create },
    } as unknown as PrismaClient;

    await expect(
      new ProcurementService(prisma).createPurchase(
        {
          supplierId: "supplier-1",
          purchaseDate: new Date("2026-10-01T00:00:00.000Z"),
          paymentTerms: "PAID",
          paidAmountTnd: "0",
          // 0,0001 kg at 0,001 TND: a total of 0,000.
          lines: [line("salt", "0.0001", "0.001")],
        },
        { actorUserId: "user-1" },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      fieldErrors: {
        "lines.0.unitPriceTnd":
          "Le total de la ligne doit être supérieur à zéro.",
      },
    });
    expect(create).not.toHaveBeenCalled();
  });
});
