import type {
  Customer,
  CustomerPayment,
  SaleSummary,
} from "../../features/customers/customers.api.js";
import type { Order, OrderLine } from "../../features/orders/orders.api.js";

let sequence = 0;
const next = () => (sequence += 1);

export function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  const n = next();
  return {
    id: `customer-${n}`,
    name: `Client ${n}`,
    phone: "22 000 000",
    address: null,
    taxIdentifier: null,
    notes: null,
    isActive: true,
    version: 1,
    createdAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}

export function makeSale(overrides: Partial<SaleSummary> = {}): SaleSummary {
  const n = next();
  return {
    id: `sale-${n}`,
    reference: `VT-${String(n).padStart(6, "0")}`,
    customerId: "customer-1",
    status: "POSTED",
    paymentState: "UNPAID",
    soldAt: "2026-09-15T10:00:00.000Z",
    totalTnd: "30.000",
    paidAmountTnd: "0.000",
    remainingDueTnd: "30.000",
    ...overrides,
  };
}

export function makeCustomerPayment(
  overrides: Partial<CustomerPayment> = {},
): CustomerPayment {
  const n = next();
  const customer =
    overrides.customer ??
    makeCustomer({ id: "customer-1", name: "Amel Trabelsi" });
  return {
    id: `cpayment-${n}`,
    customerId: customer.id,
    sessionId: null,
    amountTnd: "15.000",
    paidAt: "2026-09-20T09:00:00.000Z",
    reference: null,
    notes: null,
    customer,
    allocations: [],
    reversedAt: null,
    reversalReason: null,
    ...overrides,
  };
}

export function makeOrderLine(overrides: Partial<OrderLine> = {}): OrderLine {
  const n = next();
  return {
    id: `oline-${n}`,
    productId: "product-1",
    unitId: "unit-piece",
    quantity: "10.000000",
    unitPriceTnd: "4.000",
    lineTotalTnd: "40.000",
    productNameSnapshot: "Pain complet",
    unitNameSnapshot: "Pièce",
    ...overrides,
  };
}

export function makeOrder(overrides: Partial<Order> = {}): Order {
  const n = next();
  const customer =
    overrides.customer ??
    makeCustomer({ id: "customer-1", name: "Amel Trabelsi" });
  const lines = overrides.lines ?? [makeOrderLine()];
  return {
    id: `order-${n}`,
    reference: `CMD-${String(n).padStart(6, "0")}`,
    customerId: customer.id,
    status: "CONFIRMED",
    requestedFulfillmentAt: "2026-09-24T09:00:00.000Z",
    totalTnd: "40.000",
    advanceBalanceTnd: "0.000",
    notes: null,
    version: 1,
    saleId: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    advanceDisposition: null,
    createdAt: "2026-09-23T08:00:00.000Z",
    customer,
    _count: { lines: lines.length },
    lines,
    advances: [],
    sale: null,
    ...overrides,
  };
}
