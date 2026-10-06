import { lazy, Suspense, type ReactNode } from "react";
import {
  createBrowserRouter,
  createMemoryRouter,
  Outlet,
  type RouteObject,
} from "react-router-dom";
import { Skeleton } from "../components/ui/Skeleton/Skeleton.js";
import {
  loadLoginPage,
  loadProductsPage,
  loadProductDetailPage,
  loadRawMaterialsPage,
  loadRawMaterialDetailPage,
  loadCatalogSettingsPage,
  loadStockPage,
  loadMovementsPage,
  loadSuppliersPage,
  loadSupplierDetailPage,
  loadPurchasesPage,
  loadPurchaseEditorPage,
  loadShoppingTripPage,
  loadPurchaseDetailPage,
  loadSupplierPaymentsPage,
  loadCustomersPage,
  loadCustomerDetailPage,
  loadOrdersPage,
  loadOrderEditorPage,
  loadOrderDetailPage,
  loadOrderEditPage,
  loadPos,
  loadDistributorsPage,
  loadDistributorDetailPage,
  loadCustodyPage,
  loadDispatchEditorPage,
  loadDispatchDetailPage,
  loadSettlementPage,
  loadDistributorPaymentsPage,
  loadExpensesPage,
  loadExpenseCategoriesPage,
  loadSimulationsPage,
  loadSimulationEditorPage,
  loadSimulationDetailPage,
  loadUsersPage,
  loadRolesPage,
  loadAuditPage,
  loadSettingsPage,
  loadAccueilPage,
  loadAnalyticsPage,
} from "./routeLoaders.js";
import { AccessDeniedPage } from "../features/shell/AccessDeniedPage.js";
import { NotFoundPage } from "../features/shell/NotFoundPage.js";
import { ProtectedLayout } from "./ProtectedLayout.js";
import { RootLayout } from "./RootLayout.js";
import { useSessionPermissions } from "./sessionContext.js";
import { RequirePermission } from "../lib/auth/RequirePermission.js";
import type { PermissionKey } from "../lib/auth/permissions.js";

const LoginPage = lazy(() =>
  loadLoginPage().then((m) => ({ default: m.LoginPage })),
);
const ProductsPage = lazy(() =>
  loadProductsPage().then((m) => ({ default: m.ProductsPage })),
);
const ProductDetailPage = lazy(() =>
  loadProductDetailPage().then((m) => ({ default: m.ProductDetailPage })),
);
const RawMaterialsPage = lazy(() =>
  loadRawMaterialsPage().then((m) => ({ default: m.RawMaterialsPage })),
);
const RawMaterialDetailPage = lazy(() =>
  loadRawMaterialDetailPage().then((m) => ({
    default: m.RawMaterialDetailPage,
  })),
);
const CatalogSettingsPage = lazy(() =>
  loadCatalogSettingsPage().then((m) => ({ default: m.CatalogSettingsPage })),
);
const StockPage = lazy(() =>
  loadStockPage().then((m) => ({ default: m.StockPage })),
);
const MovementsPage = lazy(() =>
  loadMovementsPage().then((m) => ({ default: m.MovementsPage })),
);
const SuppliersPage = lazy(() =>
  loadSuppliersPage().then((m) => ({ default: m.SuppliersPage })),
);
const SupplierDetailPage = lazy(() =>
  loadSupplierDetailPage().then((m) => ({ default: m.SupplierDetailPage })),
);
const PurchasesPage = lazy(() =>
  loadPurchasesPage().then((m) => ({ default: m.PurchasesPage })),
);
const PurchaseEditorPage = lazy(() =>
  loadPurchaseEditorPage().then((m) => ({ default: m.PurchaseEditorPage })),
);
const ShoppingTripPage = lazy(() =>
  loadShoppingTripPage().then((m) => ({ default: m.ShoppingTripPage })),
);
const PurchaseDetailPage = lazy(() =>
  loadPurchaseDetailPage().then((m) => ({ default: m.PurchaseDetailPage })),
);
const SupplierPaymentsPage = lazy(() =>
  loadSupplierPaymentsPage().then((m) => ({ default: m.SupplierPaymentsPage })),
);
const CustomersPage = lazy(() =>
  loadCustomersPage().then((m) => ({ default: m.CustomersPage })),
);
const CustomerDetailPage = lazy(() =>
  loadCustomerDetailPage().then((m) => ({ default: m.CustomerDetailPage })),
);
const OrdersPage = lazy(() =>
  loadOrdersPage().then((m) => ({ default: m.OrdersPage })),
);
const OrderEditorPage = lazy(() =>
  loadOrderEditorPage().then((m) => ({ default: m.OrderEditorPage })),
);
const OrderDetailPage = lazy(() =>
  loadOrderDetailPage().then((m) => ({ default: m.OrderDetailPage })),
);
const OrderEditPage = lazy(() =>
  loadOrderEditPage().then((m) => ({ default: m.OrderEditPage })),
);
const CaissePage = lazy(() =>
  loadPos().then((m) => ({ default: m.CaissePage })),
);
const SalesPage = lazy(() => loadPos().then((m) => ({ default: m.SalesPage })));
const SaleDetailPage = lazy(() =>
  loadPos().then((m) => ({ default: m.SaleDetailPage })),
);
const SessionsPage = lazy(() =>
  loadPos().then((m) => ({ default: m.SessionsPage })),
);
const SessionDetailPage = lazy(() =>
  loadPos().then((m) => ({ default: m.SessionDetailPage })),
);
const DistributorsPage = lazy(() =>
  loadDistributorsPage().then((m) => ({ default: m.DistributorsPage })),
);
const DistributorDetailPage = lazy(() =>
  loadDistributorDetailPage().then((m) => ({
    default: m.DistributorDetailPage,
  })),
);
const CustodyPage = lazy(() =>
  loadCustodyPage().then((m) => ({ default: m.CustodyPage })),
);
const DispatchEditorPage = lazy(() =>
  loadDispatchEditorPage().then((m) => ({ default: m.DispatchEditorPage })),
);
const DispatchDetailPage = lazy(() =>
  loadDispatchDetailPage().then((m) => ({ default: m.DispatchDetailPage })),
);
const SettlementPage = lazy(() =>
  loadSettlementPage().then((m) => ({ default: m.SettlementPage })),
);
const DistributorPaymentsPage = lazy(() =>
  loadDistributorPaymentsPage().then((m) => ({
    default: m.DistributorPaymentsPage,
  })),
);
const ExpensesPage = lazy(() =>
  loadExpensesPage().then((m) => ({ default: m.ExpensesPage })),
);
const ExpenseCategoriesPage = lazy(() =>
  loadExpenseCategoriesPage().then((m) => ({
    default: m.ExpenseCategoriesPage,
  })),
);
const SimulationsPage = lazy(() =>
  loadSimulationsPage().then((m) => ({ default: m.SimulationsPage })),
);
const SimulationEditorPage = lazy(() =>
  loadSimulationEditorPage().then((m) => ({ default: m.SimulationEditorPage })),
);
const SimulationDetailPage = lazy(() =>
  loadSimulationDetailPage().then((m) => ({ default: m.SimulationDetailPage })),
);
const UsersPage = lazy(() =>
  loadUsersPage().then((m) => ({ default: m.UsersPage })),
);
const RolesPage = lazy(() =>
  loadRolesPage().then((m) => ({ default: m.RolesPage })),
);
const AuditPage = lazy(() =>
  loadAuditPage().then((m) => ({ default: m.AuditPage })),
);
const SettingsPage = lazy(() =>
  loadSettingsPage().then((m) => ({ default: m.SettingsPage })),
);
const AccueilPage = lazy(() =>
  loadAccueilPage().then((m) => ({ default: m.AccueilPage })),
);
const AnalyticsPage = lazy(() =>
  loadAnalyticsPage().then((m) => ({ default: m.AnalyticsPage })),
);

function PageFallback() {
  return <Skeleton variant="table" rows={6} />;
}

/// A rebuilt page behind its permission group (R8 recipe step 6).
function Guarded({
  anyOf,
  children,
}: {
  anyOf: readonly PermissionKey[];
  children: ReactNode;
}) {
  const permissions = useSessionPermissions();

  return (
    <RequirePermission permissions={permissions} anyOf={anyOf}>
      <Suspense fallback={<PageFallback />}>{children}</Suspense>
    </RequirePermission>
  );
}

/// The route tree (06 section 3.7): a root layout that owns the session, a
/// public login, and the protected layout with the shell. Every screen is
/// rebuilt and mounted at its French path behind its permission group.
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      {
        path: "/connexion",
        element: (
          <Suspense fallback={<PageFallback />}>
            <LoginPage />
          </Suspense>
        ),
      },
      {
        element: <ProtectedLayout />,
        children: [
          {
            index: true,
            element: (
              <Suspense fallback={<PageFallback />}>
                <AccueilPage />
              </Suspense>
            ),
            handle: { title: "Accueil" },
          },
          {
            path: "/analyses",
            element: (
              <Guarded anyOf={["analytics.view"]}>
                <AnalyticsPage />
              </Guarded>
            ),
            handle: { title: "Analyses" },
          },
          {
            path: "/produits",
            element: (
              <Guarded anyOf={["products.view"]}>
                <ProductsPage />
              </Guarded>
            ),
            handle: { title: "Produits" },
          },
          {
            path: "/produits/:productId",
            element: (
              <Guarded anyOf={["products.view"]}>
                <ProductDetailPage />
              </Guarded>
            ),
            handle: { title: "Produit" },
          },
          {
            path: "/matieres-premieres",
            element: (
              <Guarded anyOf={["raw_materials.view"]}>
                <RawMaterialsPage />
              </Guarded>
            ),
            handle: { title: "Matières premières" },
          },
          {
            path: "/matieres-premieres/:rawMaterialId",
            element: (
              <Guarded anyOf={["raw_materials.view"]}>
                <RawMaterialDetailPage />
              </Guarded>
            ),
            handle: { title: "Matière première" },
          },
          {
            path: "/catalogue/parametres",
            element: (
              <Guarded anyOf={["categories.view", "units.view"]}>
                <CatalogSettingsPage />
              </Guarded>
            ),
            handle: { title: "Catégories et unités" },
          },
          {
            path: "/stock",
            element: (
              <Guarded anyOf={["inventory.view"]}>
                <StockPage />
              </Guarded>
            ),
            handle: { title: "Stock" },
          },
          {
            path: "/stock/mouvements",
            element: (
              <Guarded anyOf={["inventory.movements.view"]}>
                <MovementsPage />
              </Guarded>
            ),
            handle: { title: "Mouvements" },
          },
          {
            path: "/fournisseurs",
            element: (
              <Guarded anyOf={["suppliers.view"]}>
                <SuppliersPage />
              </Guarded>
            ),
            handle: { title: "Fournisseurs" },
          },
          {
            path: "/fournisseurs/:supplierId",
            element: (
              <Guarded anyOf={["suppliers.view"]}>
                <SupplierDetailPage />
              </Guarded>
            ),
            handle: { title: "Fournisseur" },
          },
          {
            path: "/achats",
            element: (
              <Guarded anyOf={["purchases.view"]}>
                <PurchasesPage />
              </Guarded>
            ),
            handle: { title: "Achats" },
          },
          {
            path: "/achats/nouveau",
            element: (
              <Guarded anyOf={["purchases.create"]}>
                <PurchaseEditorPage />
              </Guarded>
            ),
            handle: { title: "Nouvel achat" },
          },
          {
            path: "/achats/course",
            element: (
              <Guarded anyOf={["purchases.create"]}>
                <ShoppingTripPage />
              </Guarded>
            ),
            handle: { title: "Nouvelle course" },
          },
          {
            path: "/achats/:purchaseId",
            element: (
              <Guarded anyOf={["purchases.view"]}>
                <PurchaseDetailPage />
              </Guarded>
            ),
            handle: { title: "Achat" },
          },
          {
            path: "/achats/:purchaseId/modifier",
            element: (
              <Guarded anyOf={["purchases.create"]}>
                <PurchaseEditorPage />
              </Guarded>
            ),
            handle: { title: "Modifier l'achat" },
          },
          {
            path: "/paiements-fournisseurs",
            element: (
              <Guarded anyOf={["supplier_payments.view"]}>
                <SupplierPaymentsPage />
              </Guarded>
            ),
            handle: { title: "Paiements fournisseurs" },
          },
          {
            path: "/clients",
            element: (
              <Guarded anyOf={["customers.view"]}>
                <CustomersPage />
              </Guarded>
            ),
            handle: { title: "Clients" },
          },
          {
            path: "/clients/:customerId",
            element: (
              <Guarded anyOf={["customers.view"]}>
                <CustomerDetailPage />
              </Guarded>
            ),
            handle: { title: "Client" },
          },
          {
            path: "/commandes",
            element: (
              <Guarded anyOf={["orders.view"]}>
                <OrdersPage />
              </Guarded>
            ),
            handle: { title: "Commandes" },
          },
          {
            path: "/commandes/nouvelle",
            element: (
              <Guarded anyOf={["orders.create"]}>
                <OrderEditorPage />
              </Guarded>
            ),
            handle: { title: "Nouvelle commande" },
          },
          {
            path: "/commandes/:orderId",
            element: (
              <Guarded anyOf={["orders.view"]}>
                <OrderDetailPage />
              </Guarded>
            ),
            handle: { title: "Commande" },
          },
          {
            path: "/commandes/:orderId/modifier",
            element: (
              <Guarded anyOf={["orders.update"]}>
                <OrderEditPage />
              </Guarded>
            ),
            handle: { title: "Modifier la commande" },
          },
          {
            path: "/caisse",
            element: (
              <Guarded anyOf={["pos.access"]}>
                <CaissePage />
              </Guarded>
            ),
            handle: { title: "Caisse" },
          },
          {
            path: "/caisse/ventes",
            element: (
              <Guarded anyOf={["pos.access"]}>
                <SalesPage />
              </Guarded>
            ),
            handle: { title: "Ventes" },
          },
          {
            path: "/caisse/ventes/:saleId",
            element: (
              <Guarded anyOf={["pos.access"]}>
                <SaleDetailPage />
              </Guarded>
            ),
            handle: { title: "Vente" },
          },
          {
            path: "/caisse/sessions",
            element: (
              <Guarded anyOf={["pos.access"]}>
                <SessionsPage />
              </Guarded>
            ),
            handle: { title: "Sessions" },
          },
          {
            path: "/caisse/sessions/:sessionId",
            element: (
              <Guarded anyOf={["pos.access"]}>
                <SessionDetailPage />
              </Guarded>
            ),
            handle: { title: "Session de caisse" },
          },
          {
            path: "/distributeurs",
            element: (
              <Guarded anyOf={["distributors.view"]}>
                <DistributorsPage />
              </Guarded>
            ),
            handle: { title: "Distributeurs" },
          },
          {
            path: "/distributeurs/:distributorId",
            element: (
              <Guarded anyOf={["distributors.view"]}>
                <DistributorDetailPage />
              </Guarded>
            ),
            handle: { title: "Distributeur" },
          },
          {
            path: "/distribution/depot-vente",
            element: (
              <Guarded anyOf={["distribution.custody.view"]}>
                <CustodyPage />
              </Guarded>
            ),
            handle: { title: "Dépôt-vente" },
          },
          {
            path: "/distribution/sorties/nouvelle",
            element: (
              <Guarded anyOf={["distribution.dispatch"]}>
                <DispatchEditorPage />
              </Guarded>
            ),
            handle: { title: "Nouvelle sortie" },
          },
          {
            path: "/distribution/sorties/:dispatchId",
            element: (
              <Guarded anyOf={["distribution.custody.view"]}>
                <DispatchDetailPage />
              </Guarded>
            ),
            handle: { title: "Sortie" },
          },
          {
            path: "/distribution/sorties/:dispatchId/regler",
            element: (
              <Guarded anyOf={["distribution.settle"]}>
                <SettlementPage />
              </Guarded>
            ),
            handle: { title: "Régler la sortie" },
          },
          {
            path: "/distribution/reglements",
            element: (
              <Guarded anyOf={["distribution.balances.view"]}>
                <DistributorPaymentsPage />
              </Guarded>
            ),
            handle: { title: "Règlements" },
          },
          {
            path: "/depenses",
            element: (
              <Guarded anyOf={["expenses.view"]}>
                <ExpensesPage />
              </Guarded>
            ),
            handle: { title: "Dépenses" },
          },
          {
            path: "/depenses/categories",
            element: (
              <Guarded anyOf={["expense_categories.manage"]}>
                <ExpenseCategoriesPage />
              </Guarded>
            ),
            handle: { title: "Catégories de dépenses" },
          },
          {
            path: "/simulations",
            element: (
              <Guarded anyOf={["simulations.view"]}>
                <SimulationsPage />
              </Guarded>
            ),
            handle: { title: "Simulation de coût" },
          },
          {
            path: "/simulations/nouvelle",
            element: (
              <Guarded anyOf={["simulations.create"]}>
                <SimulationEditorPage />
              </Guarded>
            ),
            handle: { title: "Nouvelle simulation" },
          },
          {
            path: "/simulations/:simulationId",
            element: (
              <Guarded anyOf={["simulations.view"]}>
                <SimulationDetailPage />
              </Guarded>
            ),
            handle: { title: "Simulation" },
          },
          {
            path: "/simulations/:simulationId/modifier",
            element: (
              <Guarded anyOf={["simulations.update"]}>
                <SimulationEditorPage />
              </Guarded>
            ),
            handle: { title: "Modifier la simulation" },
          },
          {
            path: "/utilisateurs",
            element: (
              <Guarded anyOf={["users.view"]}>
                <UsersPage />
              </Guarded>
            ),
            handle: { title: "Utilisateurs" },
          },
          {
            path: "/roles",
            element: (
              <Guarded anyOf={["roles.view"]}>
                <RolesPage />
              </Guarded>
            ),
            handle: { title: "Rôles et autorisations" },
          },
          {
            path: "/roles/:roleId",
            element: (
              <Guarded anyOf={["roles.view"]}>
                <RolesPage />
              </Guarded>
            ),
            handle: { title: "Rôle" },
          },
          {
            path: "/audit",
            element: (
              <Guarded anyOf={["audit.view"]}>
                <AuditPage />
              </Guarded>
            ),
            handle: { title: "Journal d'audit" },
          },
          {
            path: "/parametres",
            element: (
              <Suspense fallback={<PageFallback />}>
                <SettingsPage />
              </Suspense>
            ),
            handle: { title: "Paramètres" },
          },
          {
            path: "/acces-refuse",
            element: <AccessDeniedPage />,
            handle: { title: "Accès refusé" },
          },
          {
            path: "*",
            element: <NotFoundPage />,
            handle: { title: "Page introuvable" },
          },
        ],
      },
    ],
  },
  { path: "*", element: <Outlet /> },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}

export function createTestRouter(initialEntries: string[]) {
  return createMemoryRouter(routes, { initialEntries });
}
