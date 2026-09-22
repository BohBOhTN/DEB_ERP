import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../shared/appError.js";

/// The keys a guard enforces are attached to the middleware itself so the
/// authorization matrix test can walk the router stack and prove no route ships
/// unguarded. A permission bypass is a release blocker, so this is checked
/// mechanically rather than by reading the routes.
export interface PermissionGuard {
  (request: Request, response: Response, next: NextFunction): void;
  permissionKeys: string[];
  mode: "all" | "any";
}

export function requirePermission(permissionKey: string): PermissionGuard {
  const guard = ((_request, response, next) => {
    const user = response.locals.currentUser as
      { id: string; effectivePermissions: string[] } | undefined;

    if (!user?.effectivePermissions.includes(permissionKey)) {
      next(permissionDenied());
      return;
    }

    next();
  }) as PermissionGuard;

  guard.permissionKeys = [permissionKey];
  guard.mode = "all";

  return guard;
}

/// For an endpoint that serves several capabilities equally, such as looking up
/// an active customer at the till for either a credit sale or an order. Any one
/// of the listed permissions is sufficient.
export function requireAnyPermission(
  permissionKeys: string[],
): PermissionGuard {
  const guard = ((_request, response, next) => {
    const user = response.locals.currentUser as
      { id: string; effectivePermissions: string[] } | undefined;
    const granted = permissionKeys.some((key) =>
      user?.effectivePermissions.includes(key),
    );

    if (!granted) {
      next(permissionDenied());
      return;
    }

    next();
  }) as PermissionGuard;

  guard.permissionKeys = [...permissionKeys];
  guard.mode = "any";

  return guard;
}

export function isPermissionGuard(value: unknown): value is PermissionGuard {
  return (
    typeof value === "function" &&
    Array.isArray((value as PermissionGuard).permissionKeys)
  );
}

function permissionDenied(): AppError {
  return new AppError({
    statusCode: 403,
    code: "PERMISSION_DENIED",
    message: "Vous n'avez pas l'autorisation necessaire.",
  });
}
