import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { appliedPaymentEntries } from "./ledger.js";

/// Issue 016: a reversal takes back what a payment still settles, the net
/// of its `PAYMENT` and `PAYMENT_REVERSAL` entries, never the payment
/// entries themselves.
const entry = (documentId: string | null, amountTnd: string) => ({
  documentId,
  amountTnd: new Prisma.Decimal(amountTnd),
});
const byDocument = (row: { documentId: string | null }) => row.documentId ?? "";

describe("appliedPaymentEntries", () => {
  it("answers what each document still receives from the payment", () => {
    const applied = appliedPaymentEntries(
      [entry("purchase-1", "-150.000"), entry("purchase-2", "-50.000")],
      byDocument,
    );

    expect(
      applied.map((row) => [row.entry.documentId, row.appliedTnd.toFixed(3)]),
    ).toEqual([
      ["purchase-1", "150.000"],
      ["purchase-2", "50.000"],
    ]);
  });

  it("drops a share already given back", () => {
    const applied = appliedPaymentEntries(
      [
        entry("purchase-1", "-150.000"),
        entry("purchase-2", "-50.000"),
        // The cancellation of the first purchase returned its share.
        entry("purchase-1", "150.000"),
      ],
      byDocument,
    );

    expect(
      applied.map((row) => [row.entry.documentId, row.appliedTnd.toFixed(3)]),
    ).toEqual([["purchase-2", "50.000"]]);
  });

  it("keeps what is left after a partial return, and the unallocated part", () => {
    const applied = appliedPaymentEntries(
      [
        entry("purchase-1", "-100.000"),
        entry("purchase-1", "40.000"),
        entry(null, "-12.500"),
      ],
      byDocument,
    );

    expect(
      applied.map((row) => [row.entry.documentId, row.appliedTnd.toFixed(3)]),
    ).toEqual([
      ["purchase-1", "60.000"],
      [null, "12.500"],
    ]);
  });

  it("answers nothing when everything was given back, even twice", () => {
    expect(
      appliedPaymentEntries(
        [entry("purchase-1", "-20.000"), entry("purchase-1", "20.000")],
        byDocument,
      ),
    ).toEqual([]);
    // A payment reversed twice before this rule: never a third time.
    expect(
      appliedPaymentEntries(
        [
          entry("purchase-1", "-20.000"),
          entry("purchase-1", "20.000"),
          entry("purchase-1", "20.000"),
        ],
        byDocument,
      ),
    ).toEqual([]);
  });

  it("reads amounts given as strings", () => {
    expect(
      appliedPaymentEntries(
        [{ documentId: "sale-1", amountTnd: "-7.250" }],
        byDocument,
      )[0]?.appliedTnd.toFixed(3),
    ).toBe("7.250");
  });
});
