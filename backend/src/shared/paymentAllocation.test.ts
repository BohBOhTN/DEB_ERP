import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { planPaymentAllocations } from "./paymentAllocation.js";

const errors = {
  duplicate: { code: "DUP", message: "dup" },
  unknownDocument: { code: "UNKNOWN", message: "unknown" },
  exceedsBalance: { code: "EXCEEDS", message: "exceeds" },
};

function tnd(value: string) {
  return new Prisma.Decimal(value);
}

const open = [
  { key: "old", balanceTnd: tnd("30.000") },
  { key: "mid", balanceTnd: tnd("20.000") },
  { key: "new", balanceTnd: tnd("50.000") },
];

describe("planPaymentAllocations", () => {
  it("places an unallocated amount on the oldest documents first", () => {
    const plan = planPaymentAllocations({
      amountTnd: tnd("45.000"),
      requested: [],
      openDocuments: open,
      errors,
    });

    expect(
      plan.allocations.map((row) => [row.key, row.amountTnd.toFixed(3)]),
    ).toEqual([
      ["old", "30.000"],
      ["mid", "15.000"],
    ]);
    expect(plan.allocations.every((row) => !row.explicit)).toBe(true);
    expect(plan.unallocatedTnd.toFixed(3)).toBe("0.000");
  });

  it("honours explicit allocations and completes the remainder around them", () => {
    const plan = planPaymentAllocations({
      amountTnd: tnd("40.000"),
      requested: [{ key: "new", amountTnd: tnd("25.000") }],
      openDocuments: open,
      errors,
    });

    expect(
      plan.allocations.map((row) => [
        row.key,
        row.amountTnd.toFixed(3),
        row.explicit,
      ]),
    ).toEqual([
      ["old", "15.000", false],
      ["new", "25.000", true],
    ]);
  });

  it("merges an explicit allocation with the automatic remainder on the same document", () => {
    const plan = planPaymentAllocations({
      amountTnd: tnd("35.000"),
      requested: [{ key: "old", amountTnd: tnd("10.000") }],
      openDocuments: open,
      errors,
    });

    expect(
      plan.allocations.map((row) => [row.key, row.amountTnd.toFixed(3)]),
    ).toEqual([
      ["old", "30.000"],
      ["mid", "5.000"],
    ]);
    expect(plan.allocations[0]?.explicit).toBe(true);
  });

  it("leaves unallocated only what exceeds every open balance", () => {
    const plan = planPaymentAllocations({
      amountTnd: tnd("120.000"),
      requested: [],
      openDocuments: open,
      errors,
    });

    expect(plan.unallocatedTnd.toFixed(3)).toBe("20.000");
  });

  it("rejects allocations above the amount, a duplicate, an unknown or an over-allocated document", () => {
    expect(() =>
      planPaymentAllocations({
        amountTnd: tnd("10.000"),
        requested: [
          { key: "old", amountTnd: tnd("6.000") },
          { key: "mid", amountTnd: tnd("6.000") },
        ],
        openDocuments: open,
        errors,
      }),
    ).toThrow(
      expect.objectContaining({ code: "PAYMENT_ALLOCATION_EXCEEDS_AMOUNT" }),
    );
    expect(() =>
      planPaymentAllocations({
        amountTnd: tnd("10.000"),
        requested: [
          { key: "old", amountTnd: tnd("4.000") },
          { key: "old", amountTnd: tnd("4.000") },
        ],
        openDocuments: open,
        errors,
      }),
    ).toThrow(expect.objectContaining({ code: "DUP" }));
    expect(() =>
      planPaymentAllocations({
        amountTnd: tnd("10.000"),
        requested: [{ key: "gone", amountTnd: tnd("4.000") }],
        openDocuments: open,
        errors,
      }),
    ).toThrow(expect.objectContaining({ code: "UNKNOWN" }));
    expect(() =>
      planPaymentAllocations({
        amountTnd: tnd("25.000"),
        requested: [{ key: "mid", amountTnd: tnd("25.000") }],
        openDocuments: open,
        errors,
      }),
    ).toThrow(expect.objectContaining({ code: "EXCEEDS" }));
  });
});
