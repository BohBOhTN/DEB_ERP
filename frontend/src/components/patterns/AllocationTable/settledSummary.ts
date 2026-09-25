import { formatMoney } from "../../../i18n/format.js";

/// Toast tail after a payment: which documents it settled, by reference,
/// from the allocations the server answered with. Empty when none.
export function settledSummary(
  allocations: Array<{ id: string; amountTnd: string }>,
  documents: Array<{ id: string; label: string }>,
): string {
  if (allocations.length === 0) {
    return ".";
  }

  const labels = new Map(documents.map((row) => [row.id, row.label]));
  const parts = allocations.map(
    (allocation) =>
      `${labels.get(allocation.id) ?? allocation.id} (${formatMoney(allocation.amountTnd)})`,
  );

  return ` · affecté à ${parts.join(", ")}.`;
}
