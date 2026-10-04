/// One import function per page chunk, shared by the router's `lazy()`
/// pages and by the navigation hover preload (UI-23), and kept apart from
/// the router so the layout can preload without a circular import.
export const loadLoginPage = () => import("../features/auth/LoginPage.js");
export const loadProductsPage = () =>
  import("../features/catalog/pages/ProductsPage.js");
export const loadProductDetailPage = () =>
  import("../features/catalog/pages/ProductDetailPage.js");
export const loadRawMaterialsPage = () =>
  import("../features/catalog/pages/RawMaterialsPage.js");
export const loadRawMaterialDetailPage = () =>
  import("../features/catalog/pages/RawMaterialDetailPage.js");
export const loadCatalogSettingsPage = () =>
  import("../features/catalog/pages/CatalogSettingsPage.js");
export const loadStockPage = () =>
  import("../features/inventory/pages/StockPage.js");
export const loadMovementsPage = () =>
  import("../features/inventory/pages/MovementsPage.js");
export const loadSuppliersPage = () =>
  import("../features/procurement/pages/SuppliersPage.js");
export const loadSupplierDetailPage = () =>
  import("../features/procurement/pages/SupplierDetailPage.js");
export const loadPurchasesPage = () =>
  import("../features/procurement/pages/PurchasesPage.js");
export const loadPurchaseEditorPage = () =>
  import("../features/procurement/pages/PurchaseEditorPage.js");
export const loadPurchaseDetailPage = () =>
  import("../features/procurement/pages/PurchaseDetailPage.js");
export const loadSupplierPaymentsPage = () =>
  import("../features/procurement/pages/SupplierPaymentsPage.js");
export const loadCustomersPage = () =>
  import("../features/customers/pages/CustomersPage.js");
export const loadCustomerDetailPage = () =>
  import("../features/customers/pages/CustomerDetailPage.js");
export const loadOrdersPage = () =>
  import("../features/orders/pages/OrdersPage.js");
export const loadOrderEditorPage = () =>
  import("../features/orders/pages/OrderEditorPage.js");
export const loadOrderEditPage = () =>
  import("../features/orders/pages/OrderEditPage.js");
export const loadOrderDetailPage = () =>
  import("../features/orders/pages/OrderDetailPage.js");
export const loadPos = () => import("../features/pos/pos.js");
export const loadDistributorsPage = () =>
  import("../features/distribution/pages/DistributorsPage.js");
export const loadDistributorDetailPage = () =>
  import("../features/distribution/pages/DistributorDetailPage.js");
export const loadCustodyPage = () =>
  import("../features/distribution/pages/CustodyPage.js");
export const loadDispatchEditorPage = () =>
  import("../features/distribution/pages/DispatchEditorPage.js");
export const loadDispatchDetailPage = () =>
  import("../features/distribution/pages/DispatchDetailPage.js");
export const loadSettlementPage = () =>
  import("../features/distribution/pages/SettlementPage.js");
export const loadDistributorPaymentsPage = () =>
  import("../features/distribution/pages/DistributorPaymentsPage.js");
export const loadExpensesPage = () =>
  import("../features/expenses/pages/ExpensesPage.js");
export const loadExpenseCategoriesPage = () =>
  import("../features/expenses/pages/ExpenseCategoriesPage.js");
export const loadSimulationsPage = () =>
  import("../features/simulation/pages/SimulationsPage.js");
export const loadSimulationEditorPage = () =>
  import("../features/simulation/pages/SimulationEditorPage.js");
export const loadSimulationDetailPage = () =>
  import("../features/simulation/pages/SimulationDetailPage.js");
export const loadUsersPage = () =>
  import("../features/access/pages/UsersPage.js");
export const loadRolesPage = () =>
  import("../features/access/pages/RolesPage.js");
export const loadAuditPage = () =>
  import("../features/audit/pages/AuditPage.js");
export const loadSettingsPage = () =>
  import("../features/settings/pages/SettingsPage.js");
export const loadAccueilPage = () => import("../features/home/AccueilPage.js");
export const loadAnalyticsPage = () =>
  import("../features/analytics/AnalyticsPage.js");

/// Page chunks by navigation path, preloaded when the pointer rests on a
/// nav link (UI-23) so the click lands on a ready page.
const routeLoaders: Record<string, () => Promise<unknown>> = {
  "/": loadAccueilPage,
  "/analyses": loadAnalyticsPage,
  "/produits": loadProductsPage,
  "/matieres-premieres": loadRawMaterialsPage,
  "/catalogue/parametres": loadCatalogSettingsPage,
  "/stock": loadStockPage,
  "/stock/mouvements": loadMovementsPage,
  "/fournisseurs": loadSuppliersPage,
  "/achats": loadPurchasesPage,
  "/paiements-fournisseurs": loadSupplierPaymentsPage,
  "/clients": loadCustomersPage,
  "/commandes": loadOrdersPage,
  "/caisse": loadPos,
  "/caisse/ventes": loadPos,
  "/caisse/sessions": loadPos,
  "/distributeurs": loadDistributorsPage,
  "/distribution/depot-vente": loadCustodyPage,
  "/distribution/reglements": loadDistributorPaymentsPage,
  "/depenses": loadExpensesPage,
  "/simulations": loadSimulationsPage,
  "/utilisateurs": loadUsersPage,
  "/roles": loadRolesPage,
  "/audit": loadAuditPage,
  "/parametres": loadSettingsPage,
};
const preloaded = new Set<string>();

export function preloadRoute(path: string): void {
  const loader = routeLoaders[path];
  if (!loader || preloaded.has(path)) return;
  preloaded.add(path);
  void loader().catch(() => preloaded.delete(path));
}
