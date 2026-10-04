import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

/// What a write changes, named by the domain rather than by the screen
/// that happened to call it (UI-26). Every mutation raises one event and
/// this map decides which query roots are refreshed: nothing more, so a
/// customer rename never re-fetches stock, and nothing less, so a sale at
/// the till refreshes stock, receivables, the order queue and the home
/// summary. Every write is audited, so the audit journal follows every
/// event.
export type DomainEvent =
  | "catalog.product"
  | "catalog.rawMaterial"
  | "catalog.reference"
  | "inventory.movement"
  | "procurement.supplier"
  | "procurement.purchase"
  | "procurement.payment"
  | "customer.record"
  | "customer.payment"
  | "order"
  | "pos.session"
  | "pos.sale"
  | "distribution.distributor"
  | "distribution.sale"
  | "distribution.dispatch"
  | "distribution.settlement"
  | "distribution.payment"
  | "expense"
  | "expense.category"
  | "simulation"
  | "access";

/// Query roots as key prefixes; a root matches every key that starts with it.
export const roots = {
  catalogProducts: ["catalog", "products"],
  catalogProduct: ["catalog", "product"],
  catalogRawMaterials: ["catalog", "rawMaterials"],
  catalogRawMaterial: ["catalog", "rawMaterial"],
  catalogReference: ["catalog", "reference"],
  catalogRelated: ["catalog", "related"],
  posProducts: ["pos", "products"],
  posSession: ["pos", "session"],
  posSales: ["pos", "sales"],
  posSale: ["pos", "sale"],
  posSessions: ["pos", "sessions"],
  posSessionDetail: ["pos", "sessionDetail"],
  inventory: ["inventory"],
  procurement: ["procurement"],
  procurementSuppliers: ["procurement", "suppliers"],
  procurementSupplier: ["procurement", "supplier"],
  customers: ["customers"],
  customersList: ["customers", "list"],
  customersDetail: ["customers", "detail"],
  orders: ["orders"],
  distribution: ["distribution"],
  distributionDistributors: ["distribution", "distributors"],
  distributionDistributor: ["distribution", "distributor"],
  expenses: ["expenses"],
  expensesCategories: ["expenses", "categories"],
  expensesList: ["expenses", "list"],
  simulations: ["simulations"],
  access: ["access"],
  session: ["auth", "me"],
  home: ["home"],
  analytics: ["analytics"],
  audit: ["audit"],
} as const satisfies Record<string, readonly string[]>;

export type QueryRoot = (typeof roots)[keyof typeof roots];

const map: Record<DomainEvent, readonly QueryRoot[]> = {
  // A product's name, price or unit shows on its lists, the till grid and
  // the stock tables; its history tab reads related documents.
  "catalog.product": [
    roots.catalogProducts,
    roots.catalogProduct,
    roots.posProducts,
    roots.inventory,
    roots.catalogRelated,
    roots.analytics,
  ],
  "catalog.rawMaterial": [
    roots.catalogRawMaterials,
    roots.catalogRawMaterial,
    roots.inventory,
    roots.catalogRelated,
  ],
  // Units and categories are printed on every product and raw material row.
  "catalog.reference": [
    roots.catalogReference,
    roots.catalogProducts,
    roots.catalogProduct,
    roots.catalogRawMaterials,
    roots.catalogRawMaterial,
    roots.posProducts,
  ],
  "inventory.movement": [
    roots.inventory,
    roots.catalogProduct,
    roots.catalogRawMaterial,
    roots.catalogRelated,
    roots.home,
  ],
  "procurement.supplier": [
    roots.procurementSuppliers,
    roots.procurementSupplier,
  ],
  // A posted purchase moves stock and the payable; a draft only its lists.
  "procurement.purchase": [
    roots.procurement,
    roots.inventory,
    roots.catalogRawMaterial,
    roots.catalogRelated,
    roots.home,
  ],
  "procurement.payment": [roots.procurement, roots.home],
  "customer.record": [
    roots.customersList,
    roots.customersDetail,
    roots.analytics,
  ],
  // Cash taken at the till belongs to the open session's expected cash; a
  // règlement settles sales, whose paid state shows on the sales list and
  // the receipt (issue #66).
  "customer.payment": [
    roots.customers,
    roots.posSession,
    roots.posSales,
    roots.posSale,
    roots.home,
    roots.analytics,
  ],
  // Completion posts a sale and moves stock; advances move cash and the
  // customer ledger.
  order: [
    roots.orders,
    roots.customers,
    roots.inventory,
    roots.posSession,
    roots.posSales,
    roots.posSessions,
    roots.home,
    roots.analytics,
  ],
  "pos.session": [
    roots.posSession,
    roots.posSessions,
    roots.posSessionDetail,
    roots.home,
  ],
  // The session history prints each session's sales count and total, and
  // every analysis reads posted sales (issue 014).
  "pos.sale": [
    roots.posSession,
    roots.posSales,
    roots.posSale,
    roots.posSessions,
    roots.posSessionDetail,
    roots.inventory,
    roots.customers,
    roots.orders,
    roots.home,
    roots.analytics,
  ],
  "distribution.distributor": [
    roots.distributionDistributors,
    roots.distributionDistributor,
  ],
  // A direct sale moves stock and the distributor's ledger at once.
  "distribution.sale": [
    roots.distribution,
    roots.inventory,
    roots.home,
    roots.analytics,
  ],
  "distribution.dispatch": [roots.distribution, roots.inventory, roots.home],
  "distribution.settlement": [
    roots.distribution,
    roots.inventory,
    roots.home,
    roots.analytics,
  ],
  "distribution.payment": [roots.distribution, roots.home],
  expense: [roots.expenses, roots.home, roots.analytics],
  // Category names are printed on every expense row.
  "expense.category": [roots.expensesCategories, roots.expensesList],
  simulation: [roots.simulations],
  // The caller's own permissions may have changed.
  access: [roots.access, roots.session],
};

export function rootsFor(event: DomainEvent): readonly QueryRoot[] {
  return [...map[event], roots.audit];
}

/// Refreshes every query under the event's roots. Active queries re-fetch
/// at once; inactive ones are marked stale and re-fetch when shown again.
export async function invalidateAfter(
  queryClient: QueryClient,
  event: DomainEvent,
): Promise<void> {
  await Promise.all(
    rootsFor(event).map((root) =>
      queryClient.invalidateQueries({ queryKey: [...root] }),
    ),
  );
}

/// `onSuccess` of a mutation: `useMutation({ onSuccess: useInvalidateAfter("pos.sale") })`.
export function useInvalidateAfter(event: DomainEvent): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(
    () => invalidateAfter(queryClient, event),
    [queryClient, event],
  );
}

/// Shows an updated record at once on its detail screen, before the
/// invalidation's re-fetch lands, so an edit never flashes the old values.
export function primeDetail<T>(
  queryClient: QueryClient,
  key: readonly unknown[],
  data: T,
): void {
  queryClient.setQueryData([...key], data);
}
