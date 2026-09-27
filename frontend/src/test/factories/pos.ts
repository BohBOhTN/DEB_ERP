import type {
  PosProduct,
  PosSession,
  Sale,
} from "../../features/pos/pos.api.js";
import { breadCategory, kg, pastryCategory, piece } from "./catalog.js";

let sequence = 0;
const next = () => (sequence += 1);

export function makePosSession(
  overrides: Partial<PosSession> = {},
): PosSession {
  return {
    id: "session-1",
    status: "OPEN",
    openedAt: "2026-09-23T06:00:00.000Z",
    openedByUserId: "user-1",
    openingCashTnd: "50.000",
    closedAt: null,
    closedByUserId: null,
    countedCashTnd: null,
    expectedCashTnd: null,
    cashDifferenceTnd: null,
    notes: null,
    terminal: { id: "terminal-1", code: "MAIN", name: "Caisse principale" },
    openedBy: { id: "user-1", displayName: "Salma Ben Ali" },
    closedBy: null,
    ...overrides,
  };
}

export const posProducts: PosProduct[] = [
  {
    id: "product-1",
    code: "PC",
    barcode: null,
    name: "Pain complet",
    salePriceTnd: "1.200",
    imageUrl: null,
    isStockable: true,
    isActive: true,
    baseUnit: piece,
    category: breadCategory,
  },
  {
    id: "product-2",
    code: null,
    barcode: null,
    name: "Croissant",
    salePriceTnd: "1.000",
    imageUrl: null,
    isStockable: true,
    isActive: true,
    baseUnit: piece,
    category: pastryCategory,
  },
  {
    id: "product-3",
    code: null,
    barcode: null,
    name: "Gâteau au kilo",
    salePriceTnd: "18.000",
    // Issue #64: one tile with a photo among the text tiles.
    imageUrl: "/media/products/gateau.webp",
    isStockable: false,
    isActive: true,
    baseUnit: kg,
    category: pastryCategory,
  },
];

export function makePosProduct(
  overrides: Partial<PosProduct> = {},
): PosProduct {
  const n = next();
  return {
    id: `product-${n}`,
    code: null,
    barcode: null,
    name: `Produit ${n}`,
    salePriceTnd: "2.000",
    imageUrl: null,
    isStockable: true,
    isActive: true,
    baseUnit: piece,
    category: breadCategory,
    ...overrides,
  };
}

export function makeSale(overrides: Partial<Sale> = {}): Sale {
  const n = next();
  return {
    id: `sale-${n}`,
    reference: `VT-${String(n).padStart(6, "0")}`,
    sessionId: "session-1",
    customerId: null,
    status: "POSTED",
    paymentState: "PAID",
    soldAt: "2026-09-23T08:30:00.000Z",
    totalTnd: "3.400",
    paidAmountTnd: "3.400",
    remainingDueTnd: "0.000",
    postedAt: "2026-09-23T08:30:00.000Z",
    postedByUserId: "user-1",
    cancelledAt: null,
    cancellationReason: null,
    customer: null,
    postedBy: { id: "user-1", displayName: "Salma Ben Ali" },
    cancelledBy: null,
    order: null,
    paymentAllocations: [],
    appliedAdvanceTnd: "0.000",
    lines: [
      {
        id: `sline-${n}`,
        productId: "product-1",
        quantity: "2.000000",
        unitPriceTnd: "1.200",
        lineTotalTnd: "2.400",
        productNameSnapshot: "Pain complet",
        unitNameSnapshot: "Pièce",
      },
    ],
    payments: [
      {
        id: `spay-${n}`,
        amountTnd: "3.400",
        method: "CASH",
        movement: "RECEIPT",
        paidAt: "2026-09-23T08:30:00.000Z",
      },
    ],
    ...overrides,
  };
}
