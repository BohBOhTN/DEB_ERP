import { Prisma, SalePaymentState } from "@prisma/client";

/// The paid state every receivable document shows (POS sale, order sale,
/// distributor sale, settlement). One rule for all of them: paid in full,
/// nothing paid, or somewhere in between.
export function derivePaymentState(
  totalTnd: Prisma.Decimal,
  paidAmountTnd: Prisma.Decimal,
): SalePaymentState {
  if (paidAmountTnd.greaterThanOrEqualTo(totalTnd)) {
    return SalePaymentState.PAID;
  }

  if (paidAmountTnd.lessThanOrEqualTo(0)) {
    return SalePaymentState.UNPAID;
  }

  return SalePaymentState.PARTIALLY_PAID;
}

/// GOV-006: the ledger is authoritative and a document's stored paid amount,
/// remaining due and state are projections of it. Given the document total
/// and its current ledger balance, this is what the row must store.
export function documentPaymentProjection(
  totalTnd: Prisma.Decimal | string,
  ledgerBalanceTnd: Prisma.Decimal | string,
) {
  const total = new Prisma.Decimal(totalTnd);
  const balance = new Prisma.Decimal(ledgerBalanceTnd);
  const remainingDueTnd = balance.lessThan(0)
    ? new Prisma.Decimal(0)
    : balance.greaterThan(total)
      ? total
      : balance;
  const paidAmountTnd = total.minus(remainingDueTnd);

  return {
    paidAmountTnd: paidAmountTnd.toFixed(3),
    remainingDueTnd: remainingDueTnd.toFixed(3),
    paymentState: derivePaymentState(total, paidAmountTnd),
  };
}
