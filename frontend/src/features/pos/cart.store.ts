import Decimal from "decimal.js-light";
import { create } from "zustand";
import { createIdempotencyKey } from "../../lib/api/idempotency.js";

/// The POS cart (06 section 1, R9 Sprint 23): in-memory only, never
/// persisted. One idempotency key per cart intent: it is created with the
/// cart, reused on every retry of the same checkout, and replaced only when
/// the cart is cleared after a success or on purpose.
export interface CartLine {
  productId: string;
  name: string;
  unitSymbol: string;
  unitPriceTnd: string;
  quantity: string;
  isStockable: boolean;
  categoryName: string;
}

export type CartMode = "SALE" | "ORDER";

export interface CartCustomer {
  id: string;
  name: string;
}

export interface CartState {
  lines: CartLine[];
  customer: CartCustomer | null;
  mode: CartMode;
  paidAmountTnd: string;
  fulfillmentAt: string;
  advanceTnd: string;
  intentKey: string;
  advanceKey: string;
  add: (product: Omit<CartLine, "quantity">) => void;
  setQuantity: (productId: string, quantity: string) => void;
  increment: (productId: string, step?: number) => void;
  remove: (productId: string) => void;
  setCustomer: (customer: CartCustomer | null) => void;
  setMode: (mode: CartMode) => void;
  setPaidAmount: (amount: string) => void;
  setFulfillmentAt: (value: string) => void;
  setAdvance: (amount: string) => void;
  clear: () => void;
}

const emptyCart = () => ({
  lines: [] as CartLine[],
  customer: null,
  mode: "SALE" as CartMode,
  paidAmountTnd: "",
  fulfillmentAt: "",
  advanceTnd: "",
  intentKey: createIdempotencyKey(),
  advanceKey: createIdempotencyKey(),
});

export const useCartStore = create<CartState>((set) => ({
  ...emptyCart(),
  add: (product) =>
    set((state) => {
      const existing = state.lines.find(
        (line) => line.productId === product.productId,
      );
      return {
        lines: existing
          ? state.lines.map((line) =>
              line.productId === product.productId
                ? {
                    ...line,
                    quantity: new Decimal(line.quantity).plus(1).toString(),
                  }
                : line,
            )
          : [...state.lines, { ...product, quantity: "1" }],
      };
    }),
  setQuantity: (productId, quantity) =>
    set((state) => ({
      lines: state.lines.map((line) =>
        line.productId === productId ? { ...line, quantity } : line,
      ),
    })),
  increment: (productId, step = 1) =>
    set((state) => ({
      lines: state.lines
        .map((line) =>
          line.productId === productId
            ? {
                ...line,
                quantity: safeDecimal(line.quantity).plus(step).toString(),
              }
            : line,
        )
        .filter((line) => safeDecimal(line.quantity).greaterThan(0)),
    })),
  remove: (productId) =>
    set((state) => ({
      lines: state.lines.filter((line) => line.productId !== productId),
    })),
  setCustomer: (customer) => set({ customer }),
  setMode: (mode) => set({ mode }),
  setPaidAmount: (paidAmountTnd) => set({ paidAmountTnd }),
  setFulfillmentAt: (fulfillmentAt) => set({ fulfillmentAt }),
  setAdvance: (advanceTnd) => set({ advanceTnd }),
  clear: () => set(emptyCart()),
}));

export function lineTotal(
  line: Pick<CartLine, "quantity" | "unitPriceTnd">,
): Decimal {
  return safeDecimal(line.quantity)
    .times(safeDecimal(line.unitPriceTnd))
    .toDecimalPlaces(3);
}

export function cartTotal(
  lines: Array<Pick<CartLine, "quantity" | "unitPriceTnd">>,
): Decimal {
  return lines.reduce((sum, line) => sum.plus(lineTotal(line)), new Decimal(0));
}

export function cartCount(lines: Array<Pick<CartLine, "quantity">>): number {
  return lines.reduce(
    (sum, line) => sum + safeDecimal(line.quantity).toNumber(),
    0,
  );
}

export function safeDecimal(
  value: string | number | null | undefined,
): Decimal {
  try {
    return new Decimal(String(value ?? "").replace(",", ".") || 0);
  } catch {
    return new Decimal(0);
  }
}
