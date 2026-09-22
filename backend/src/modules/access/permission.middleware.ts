import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../shared/appError.js";

export function requirePermission(permissionKey: string) {
  return (_request: Request, response: Response, next: NextFunction) => {
    const user = response.locals.currentUser as
      { id: string; effectivePermissions: string[] } | undefined;

    if (!user?.effectivePermissions.includes(permissionKey)) {
      next(
        new AppError({
          statusCode: 403,
          code: "PERMISSION_DENIED",
          message: "Vous n'avez pas l'autorisation necessaire.",
        }),
      );
      return;
    }

    next();
  };
}

/// For an endpoint that serves several capabilities equally, such as looking up
/// an active customer at the till for either a credit sale or an order. Any one
/// of the listed permissions is sufficient.
export function requireAnyPermission(permissionKeys: string[]) {
  return (_request: Request, response: Response, next: NextFunction) => {
    const user = response.locals.currentUser as
      { id: string; effectivePermissions: string[] } | undefined;
    const granted = permissionKeys.some((key) =>
      user?.effectivePermissions.includes(key),
    );

    if (!granted) {
      next(
        new AppError({
          statusCode: 403,
          code: "PERMISSION_DENIED",
          message: "Vous n'avez pas l'autorisation necessaire.",
        }),
      );
      return;
    }

    next();
  };
}
