import type { Prisma } from "@prisma/client";

/// Issue 008: the product's approximate cost as it stands when a line is
/// posted, kept on the line like the price so a later edit of the cost
/// leaves the margin of that day untouched. `null` when the product has no
/// cost (the Accueil tile then says the line was not costed).
export function unitCostSnapshot(
  product:
    { approximateCostTnd?: Prisma.Decimal | string | null } | null | undefined,
): string | null {
  const cost = product?.approximateCostTnd;

  if (cost === null || cost === undefined) {
    return null;
  }

  return typeof cost === "string" ? cost : cost.toFixed(3);
}
