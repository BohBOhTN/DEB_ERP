import type { NextFunction, Request, Response } from "express";
import type { AuthService } from "./auth.service.js";
import { readCookie } from "./cookies.js";

/// Tagged so the authorization matrix test can tell a protected router from a
/// deliberately public one without reconstructing mount paths.
export interface AuthenticationGuard {
  (request: Request, response: Response, next: NextFunction): Promise<void>;
  requiresAuthentication: true;
}

export function isAuthenticationGuard(
  value: unknown,
): value is AuthenticationGuard {
  return (
    typeof value === "function" &&
    (value as AuthenticationGuard).requiresAuthentication === true
  );
}

export function requireAuthentication(params: {
  authService: AuthService;
  cookieName: string;
}): AuthenticationGuard {
  const guard = (async (
    request: Request,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      response.locals.currentUser = await params.authService.getCurrentUser(
        readCookie(request, params.cookieName),
      );
      next();
    } catch (error) {
      next(error);
    }
  }) as AuthenticationGuard;

  guard.requiresAuthentication = true;

  return guard;
}
