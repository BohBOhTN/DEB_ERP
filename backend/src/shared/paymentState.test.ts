import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  derivePaymentState,
  documentPaymentProjection,
} from "./paymentState.js";

describe("payment state", () => {
  it("derives the three states from total and paid", () => {
    const total = new Prisma.Decimal("50.000");
    expect(derivePaymentState(total, new Prisma.Decimal("50.000"))).toBe(
      "PAID",
    );
    expect(derivePaymentState(total, new Prisma.Decimal("0"))).toBe("UNPAID");
    expect(derivePaymentState(total, new Prisma.Decimal("12.500"))).toBe(
      "PARTIALLY_PAID",
    );
  });

  it("projects the stored fields from the ledger balance and clamps it to the document", () => {
    expect(documentPaymentProjection("50.000", "20.000")).toEqual({
      paidAmountTnd: "30.000",
      remainingDueTnd: "20.000",
      paymentState: "PARTIALLY_PAID",
    });
    expect(documentPaymentProjection("50.000", "0")).toEqual({
      paidAmountTnd: "50.000",
      remainingDueTnd: "0.000",
      paymentState: "PAID",
    });
    expect(documentPaymentProjection("50.000", "-5.000").remainingDueTnd).toBe(
      "0.000",
    );
  });
});
