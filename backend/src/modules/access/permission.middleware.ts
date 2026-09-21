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
