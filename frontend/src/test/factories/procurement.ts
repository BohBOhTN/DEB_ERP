import type {
  Purchase,
  PurchaseLine,
  Supplier,
  SupplierPayment,
} from "../../features/procurement/procurement.api.js";

let sequence = 0;
const next = () => (sequence += 1);

export function makeSupplier(overrides: Partial<Supplier> = {}): Supplier {
  const n = next();
  return {
    id: `supplier-${n}`,
    name: `Minoterie ${n}`,
    phone: "71 000 000",
    address: null,
    taxIdentifier: null,
    notes: null,
    isActive: true,
    version: 1,
    createdAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}

export function makePurchaseLine(
  overrides: Partial<PurchaseLine> = {},
): PurchaseLine {
  const n = next();
  return {
    id: `line-${n}`,
    rawMaterialId: "raw-1",
    productId: null,
    enteredUnitId: "unit-sac",
    baseUnitId: "unit-kg",
    enteredQuantity: "4",
    conversionFactorToBase: "25.000000",
    normalizedQuantity: "100.000000",
    unitPriceTnd: "62.500",
    lineTotalTnd: "250.000",
    rawMaterialNameSnapshot: "Farine T55",
    enteredUnitNameSnapshot: "Sac de 25 kg",
    baseUnitNameSnapshot: "Kilogramme",
    ...overrides,
  };
}

export function makePurchase(overrides: Partial<Purchase> = {}): Purchase {
  const n = next();
  const supplier =
    overrides.supplier ??
    makeSupplier({ id: "supplier-1", name: "Minoterie du Sud" });
  return {
    id: `purchase-${n}`,
    reference: `AC-${String(n).padStart(6, "0")}`,
    supplierId: supplier.id,
    purchaseDate: "2026-09-20T08:00:00.000Z",
    supplierReference: null,
    status: "POSTED",
    paymentTerms: "PARTIAL",
    dueDate: "2026-10-20T08:00:00.000Z",
    totalTnd: "250.000",
    paidAmountTnd: "100.000",
    notes: null,
    postedAt: "2026-09-20T08:05:00.000Z",
    cancelledAt: null,
    cancellationReason: null,
    createdAt: "2026-09-20T08:00:00.000Z",
    supplier,
    lines: [makePurchaseLine()],
    balanceTnd: "150.000",
    paymentState: "PARTIALLY_PAID",
    ...overrides,
  };
}

export function makeSupplierPayment(
  overrides: Partial<SupplierPayment> = {},
): SupplierPayment {
  const n = next();
  const supplier =
    overrides.supplier ??
    makeSupplier({ id: "supplier-1", name: "Minoterie du Sud" });
  return {
    id: `payment-${n}`,
    supplierId: supplier.id,
    amountTnd: "100.000",
    method: "CASH",
    paidAt: "2026-09-20T08:05:00.000Z",
    reference: null,
    notes: null,
    supplier,
    allocations: [],
    reversedAt: null,
    reversalReason: null,
    ...overrides,
  };
}
