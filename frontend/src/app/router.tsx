import { lazy, Suspense } from "react";
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

const LoginPage = lazy(() =>
  import("../features/auth/LoginPage.js").then((m) => ({
    default: m.LoginPage,
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
