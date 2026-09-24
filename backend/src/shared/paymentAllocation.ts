import { Prisma } from "@prisma/client";
import { AppError } from "./appError.js";

/// One open document a payment can settle: its key and what it still owes.
/// The caller passes them oldest first; that order is the automatic
/// allocation order.
export interface OpenDocumentBalance {
  key: string;
  balanceTnd: Prisma.Decimal;
}

/// An allocation the client asked for explicitly.
export interface RequestedAllocation {
  key: string;
  amountTnd: Prisma.Decimal;
}

export interface PlannedAllocation {
  key: string;
  amountTnd: Prisma.Decimal;
  /// True when the client named the document; false when the planner picked
  /// it to place the remainder.
  explicit: boolean;
}

export interface AllocationErrorCodes {
  duplicate: { code: string; message: string };
  unknownDocument: { code: string; message: string };
  exceedsBalance: { code: string; message: string };
}

/// Decides which documents a payment settles.
///
/// Explicit allocations are honoured first and validated against the open
/// documents (each at most its balance, no duplicates, together at most the
/// amount). Whatever is left of the amount is then placed on the open
/// documents oldest first until it runs out. Only an amount that exceeds
/// every open balance stays unallocated; the callers already refuse an
/// amount above the party balance, so that remainder is the historical case
/// of payments recorded without a document.
export function planPaymentAllocations(params: {
  amountTnd: Prisma.Decimal;
  requested: RequestedAllocation[];
  openDocuments: OpenDocumentBalance[];
  errors: AllocationErrorCodes;
}): { allocations: PlannedAllocation[]; unallocatedTnd: Prisma.Decimal } {
  const seen = new Set<string>();
  for (const request of params.requested) {
    if (seen.has(request.key)) {
      throw new AppError({ statusCode: 400, ...params.errors.duplicate });
    }
    seen.add(request.key);
  }

  const requestedTotal = params.requested.reduce(
    (sum, request) => sum.plus(request.amountTnd),
    new Prisma.Decimal(0),
  );

  if (requestedTotal.greaterThan(params.amountTnd)) {
    throw new AppError({
      statusCode: 400,
      code: "PAYMENT_ALLOCATION_EXCEEDS_AMOUNT",
      message: "La somme des affectations dépasse le montant payé.",
    });
  }

  const openByKey = new Map(
    params.openDocuments.map((document) => [document.key, document]),
  );
  const planned = new Map<string, PlannedAllocation>();

  for (const request of params.requested) {
    const document = openByKey.get(request.key);

    if (!document) {
      throw new AppError({ statusCode: 400, ...params.errors.unknownDocument });
    }

    if (request.amountTnd.greaterThan(document.balanceTnd)) {
      throw new AppError({ statusCode: 400, ...params.errors.exceedsBalance });
    }

    planned.set(request.key, {
      key: request.key,
      amountTnd: request.amountTnd,
      explicit: true,
    });
  }

  let remainder = params.amountTnd.minus(requestedTotal);

  for (const document of params.openDocuments) {
    if (!remainder.greaterThan(0)) {
      break;
    }

    const already = planned.get(document.key)?.amountTnd ?? new Prisma.Decimal(0);
    const available = document.balanceTnd.minus(already);

    if (!available.greaterThan(0)) {
      continue;
    }

    const take = available.lessThan(remainder) ? available : remainder;
    const existing = planned.get(document.key);
    planned.set(document.key, {
      key: document.key,
      amountTnd: already.plus(take),
      explicit: existing?.explicit ?? false,
    });
    remainder = remainder.minus(take);
  }

  // Document order keeps statements readable: oldest document first.
  const order = new Map(
    params.openDocuments.map((document, index) => [document.key, index]),
  );
  const allocations = [...planned.values()].sort(
    (left, right) => (order.get(left.key) ?? 0) - (order.get(right.key) ?? 0),
  );

  return { allocations, unallocatedTnd: remainder };
}
