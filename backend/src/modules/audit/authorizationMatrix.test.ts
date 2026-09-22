import type { Express } from "express";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { AuthService } from "../auth/auth.service.js";
import type {
  AuthRepository,
  StoredSession,
  StoredUser,
} from "../auth/auth.types.js";
import { isPermissionGuard } from "../access/permission.middleware.js";
import { isAuthenticationGuard } from "../auth/auth.middleware.js";
import { permissionKeys } from "../access/permissions.js";

/// A permission bypass is a release blocker, so the matrix is derived from the
/// running Express stack rather than from reading the route files. If a future
/// route ships without a guard, or with a permission key that is not in the
/// catalogue, these tests fail.
///
/// Express 5 hides mount paths behind opaque matcher functions, so the matrix
/// classifies a route by the guards actually in its chain rather than by trying
/// to rebuild its URL. A router that authenticates is a protected router, and
/// every route inside one must also carry a permission.
///
/// Public by design: health needs no session, and the auth endpoints are how a
/// session is obtained in the first place.
const publicRoutePaths = ["/", "/login", "/logout", "/me"];

interface RouteGuard {
  method: string;
  path: string;
  authenticated: boolean;
  permissionKeys: string[];
  mode: "all" | "any";
}

describe("authorization matrix", () => {
  it("guards every authenticated route with a permission", () => {
    const routes = collectRoutes(buildApp());
    const unguarded = routes.filter(
      (route) => route.authenticated && route.permissionKeys.length === 0,
    );

    expect(unguarded).toEqual([]);
  });

  // The only routes that may skip authentication are health and the auth
  // endpoints themselves. Anything else unauthenticated is a bypass.
  it("leaves only the documented endpoints unauthenticated", () => {
    const routes = collectRoutes(buildApp());
    const unexpected = routes.filter(
      (route) => !route.authenticated && !publicRoutePaths.includes(route.path),
    );

    expect(unexpected).toEqual([]);
  });

  it("only uses permission keys that exist in the catalogue", () => {
    const routes = collectRoutes(buildApp());
    const unknown = routes
      .flatMap((route) =>
        route.permissionKeys.map((key) => ({ path: route.path, key })),
      )
      .filter((entry) => !permissionKeys.includes(entry.key));

    expect(unknown).toEqual([]);
  });

  // Reading and writing must never collapse into one authority.
  it("never guards a write with a view-only permission", () => {
    const routes = collectRoutes(buildApp()).filter(
      (route) => route.method !== "GET" && route.authenticated,
    );
    const writesGuardedByViewOnly = routes.filter((route) =>
      route.permissionKeys.every((key) => key.endsWith(".view")),
    );

    expect(writesGuardedByViewOnly).toEqual([]);
  });

  it("covers every module with at least one guarded route", () => {
    const routes = collectRoutes(buildApp());
    const guardedModules = new Set(
      routes.flatMap((route) =>
        route.permissionKeys.map((key) => key.split(".")[0]),
      ),
    );

    for (const expected of [
      "users",
      "roles",
      "products",
      "inventory",
      "suppliers",
      "purchases",
      "pos",
      "orders",
      "customers",
      "distributors",
      "distribution",
      "expenses",
      "simulations",
      "audit",
    ]) {
      expect(guardedModules).toContain(expected);
    }
  });
});

/// Builds the app with every module registered so the matrix sees the whole
/// surface. The services are never called; only the route stack is inspected.
function buildApp(): Express {
  const authService = new AuthService(new StubAuthRepository(), 30);
  const stub = {} as never;

  return createApp({
    allowedOrigins: ["http://localhost:5173"],
    healthCheck: async () => ({
      status: "ok",
      service: "api",
      environment: "test",
      database: { status: "ok" },
    }),
    auth: {
      authService,
      cookie: { name: "test_session", secure: false, maxAgeMs: 1000 },
      rateLimit: { maxAttempts: 100, windowMs: 60_000 },
    },
    access: { accessService: stub },
    audit: { auditService: stub },
    catalog: { catalogService: stub },
    customers: { customersService: stub },
    distribution: { distributionService: stub },
    expenses: { expensesService: stub },
    inventory: { inventoryService: stub },
    orders: { ordersService: stub },
    procurement: { procurementService: stub },
    pos: { posService: stub },
    simulation: { simulationService: stub },
  });
}

interface ExpressLayer {
  name?: string;
  handle?: unknown;
  route?: {
    path?: string;
    methods?: Record<string, boolean>;
    stack?: Array<{ handle?: unknown }>;
  };
  matchers?: unknown[];
  regexp?: RegExp;
  path?: string;
  stack?: ExpressLayer[];
}

function collectRoutes(app: Express): RouteGuard[] {
  const router = (app as unknown as { router?: { stack?: ExpressLayer[] } })
    .router;
  const routes: RouteGuard[] = [];

  walk(router?.stack ?? [], false, routes);

  // A sanity check on the walker itself: if it silently found nothing, the
  // "everything is guarded" assertions above would pass vacuously.
  if (routes.length === 0) {
    throw new Error("no routes discovered; the router walker needs updating");
  }

  return routes;
}

function walk(
  layers: ExpressLayer[],
  authenticated: boolean,
  routes: RouteGuard[],
): void {
  // A router applies requireAuthentication with router.use before its routes,
  // so every route in this stack inherits it.
  const routerAuthenticates =
    authenticated ||
    layers.some((layer) => isAuthenticationGuard(layer.handle));

  for (const layer of layers) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods ?? {}).map((method) =>
        method.toUpperCase(),
      );
      const handlers = (layer.route.stack ?? []).map((entry) => entry.handle);
      const guards = handlers.filter(isPermissionGuard);

      for (const method of methods) {
        routes.push({
          method,
          path: layer.route.path ?? "",
          authenticated:
            routerAuthenticates || handlers.some(isAuthenticationGuard),
          permissionKeys: guards.flatMap((guard) => guard.permissionKeys),
          mode: guards[0]?.mode ?? "all",
        });
      }

      continue;
    }

    const nested = (layer.handle as { stack?: ExpressLayer[] } | undefined)
      ?.stack;

    if (nested) {
      walk(nested, routerAuthenticates, routes);
    }
  }
}

class StubAuthRepository implements AuthRepository {
  public async findUserByEmail(): Promise<StoredUser | null> {
    return null;
  }

  public async findEffectivePermissionKeys(): Promise<string[]> {
    return [];
  }

  public async createSession(): Promise<void> {
    return;
  }

  public async findSessionByTokenHash(): Promise<StoredSession | null> {
    return null;
  }

  public async touchSession(): Promise<void> {
    return;
  }

  public async revokeSession(): Promise<void> {
    return;
  }

  public async createUser(): Promise<StoredUser> {
    throw new Error("not used");
  }
}
