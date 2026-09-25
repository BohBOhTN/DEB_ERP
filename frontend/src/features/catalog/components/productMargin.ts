import Decimal from "decimal.js-light";

/// Issue 008: the approximate margin of a product, price less the owner's
/// cost, and its share of the price. `null` when no cost is set.
export function productMargin(
  salePriceTnd: string,
  approximateCostTnd: string | null | undefined,
): { amountTnd: string; rate: string | null } | null {
  if (approximateCostTnd === null || approximateCostTnd === undefined) {
    return null;
  }

  const price = new Decimal(salePriceTnd);
  const amount = price.minus(approximateCostTnd);

  return {
    amountTnd: amount.toFixed(3),
    rate: price.greaterThan(0)
      ? amount.dividedBy(price).times(100).toDecimalPlaces(1).toString()
      : null,
  };
}
