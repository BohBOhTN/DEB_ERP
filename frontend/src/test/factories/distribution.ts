import type {
  Dispatch,
  DispatchLine,
  Distributor,
  DistributorPayment,
  DistributorSale,
  Settlement,
} from "../../features/distribution/distribution.api.js";

let sequence = 0;
const next = () => (sequence += 1);

export function makeDistributor(
  overrides: Partial<Distributor> = {},
): Distributor {
  const n = next();
  return {
    id: `distributor-${n}`,
    name: `Distributeur ${n}`,
    phone: "50 000 000",
    address: null,
    taxIdentifier: null,
    notes: null,
    isActive: true,
    version: 1,
    createdAt: "2026-09-01T08:00:00.000Z",
    balanceTnd: "0.000",
    heldLineCount: 0,
    ...overrides,
  };
}

export function makeDispatchLine(
  overrides: Partial<DispatchLine> = {},
): DispatchLine {
  const n = next();
  return {
    id: `dline-${n}`,
    dispatchId: "dispatch-1",
    productId: "product-1",
    unitId: "unit-piece",
    dispatchedQuantity: "40.000000",
    settledSoldQuantity: "0.000000",
    returnedQuantity: "0.000000",
    unaccountedQuantity: "0.000000",
    stillHeldQuantity: "40.000000",
    productNameSnapshot: "Pain complet",
    unitNameSnapshot: "Pièce",
    ...overrides,
  };
}

export function makeDispatch(overrides: Partial<Dispatch> = {}): Dispatch {
  const n = next();
  const distributor =
    overrides.distributor ??
    makeDistributor({ id: "distributor-1", name: "Karim Distribution" });
  return {
    id: `dispatch-${n}`,
    reference: `BL-${String(n).padStart(6, "0")}`,
    distributorId: distributor.id,
    status: "OPEN",
    dispatchedAt: "2026-09-22T06:00:00.000Z",
    notes: null,
    version: 1,
    distributor,
    lines: [makeDispatchLine({ dispatchId: `dispatch-${n}` })],
    settlements: [],
    ...overrides,
  };
}

export function makeSettlement(
  overrides: Partial<Settlement> = {},
): Settlement {
  const n = next();
  return {
    id: `settlement-${n}`,
    reference: `RG-${String(n).padStart(6, "0")}`,
    distributorId: "distributor-1",
    dispatchId: "dispatch-1",
    settledAt: "2026-09-23T10:00:00.000Z",
    totalTnd: "36.000",
    paidAmountTnd: "0.000",
    remainingDueTnd: "36.000",
    paymentState: "UNPAID",
    notes: null,
    lines: [],
    ...overrides,
  };
}

export function makeDistributorSale(
  overrides: Partial<DistributorSale> = {},
): DistributorSale {
  const n = next();
  return {
    id: `dsale-${n}`,
    reference: `VD-${String(n).padStart(6, "0")}`,
    distributorId: "distributor-1",
    status: "POSTED",
    paymentState: "UNPAID",
    soldAt: "2026-09-20T09:00:00.000Z",
    totalTnd: "24.000",
    paidAmountTnd: "0.000",
    remainingDueTnd: "24.000",
    notes: null,
    lines: [],
    ...overrides,
  };
}

export function makeDistributorPayment(
  overrides: Partial<DistributorPayment> = {},
): DistributorPayment {
  const n = next();
  const distributor =
    overrides.distributor ??
    makeDistributor({ id: "distributor-1", name: "Karim Distribution" });
  return {
    id: `dpayment-${n}`,
    distributorId: distributor.id,
    amountTnd: "20.000",
    method: "CASH",
    paidAt: "2026-09-23T12:00:00.000Z",
    reference: null,
    notes: null,
    distributor,
    allocations: [],
    reversedAt: null,
    reversalReason: null,
    ...overrides,
  };
}
