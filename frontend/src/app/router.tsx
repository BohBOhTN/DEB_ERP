import { lazy, Suspense, type ReactNode } from "react";
import {
  createBrowserRouter,
  createMemoryRouter,
  Navigate,
  Outlet,
  type RouteObject,
} from "react-router-dom";
import { Skeleton } from "../components/ui/Skeleton/Skeleton.js";
import { legacyRoutes } from "../features/legacy/legacyRoutes.js";
import { LegacyScreen } from "../features/legacy/LegacyScreen.js";
import { AccessDeniedPage } from "../features/shell/AccessDeniedPage.js";
import { NotFoundPage } from "../features/shell/NotFoundPage.js";
import { ProtectedLayout } from "./ProtectedLayout.js";
import { RootLayout } from "./RootLayout.js";
import { useSessionPermissions } from "./sessionContext.js";
import { RequirePermission } from "../lib/auth/RequirePermission.js";
import type { PermissionKey } from "../lib/auth/permissions.js";

const LoginPage = lazy(() =>
  import("../features/auth/LoginPage.js").then((m) => ({
    default: m.LoginPage,
  })),
);
const ProductsPage = lazy(() =>
  import("../features/catalog/pages/ProductsPage.js").then((m) => ({
    default: m.ProductsPage,
  })),
);
const ProductDetailPage = lazy(() =>
  import("../features/catalog/pages/ProductDetailPage.js").then((m) => ({
    default: m.ProductDetailPage,
  })),
);
const RawMaterialsPage = lazy(() =>
  import("../features/catalog/pages/RawMaterialsPage.js").then((m) => ({
    default: m.RawMaterialsPage,
  })),
);
const RawMaterialDetailPage = lazy(() =>
  import("../features/catalog/pages/RawMaterialDetailPage.js").then((m) => ({
    default: m.RawMaterialDetailPage,
  })),
);
const CatalogSettingsPage = lazy(() =>
  import("../features/catalog/pages/CatalogSettingsPage.js").then((m) => ({
    default: m.CatalogSettingsPage,
  })),
);
const StockPage = lazy(() =>
  import("../features/inventory/pages/StockPage.js").then((m) => ({
    default: m.StockPage,
  })),
);
const MovementsPage = lazy(() =>
  import("../features/inventory/pages/MovementsPage.js").then((m) => ({
    default: m.MovementsPage,
  })),
);
const AccueilPage = lazy(() =>
  import("../features/home/AccueilPage.js").then((m) => ({
    default: m.AccueilPage,
  })),
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

function GuardedLegacy({ index }: { index: number }) {
  const route = legacyRoutes[index];
  const permissions = useSessionPermissions();

  if (!route) {
    return <NotFoundPage />;
  }

  return (
    <RequirePermission permissions={permissions} anyOf={route.anyOf}>
      <Suspense fallback={<PageFallback />}>
        <LegacyScreen screen={route.screen} />
      </Suspense>
    </RequirePermission>
  );
}

/// The route tree (06 section 3.7): a root layout that owns the session, a
/// public login, and the protected layout with the shell. Every V1 screen
/// is mounted at its French path behind its permission group.
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
          ...legacyRoutes.map((route, index) => ({
            path: route.path,
            element: <GuardedLegacy index={index} />,
            handle: { title: route.title, legacy: true },
          })),
          {
            path: "/acces-refuse",
            element: <AccessDeniedPage />,
            handle: { title: "Accès refusé" },
          },
          { path: "/parametres", element: <Navigate to="/" replace /> },
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
