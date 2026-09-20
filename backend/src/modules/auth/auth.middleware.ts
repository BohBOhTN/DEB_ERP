import type { NextFunction, Request, Response } from "express";
import type { AuthService } from "./auth.service.js";
import { readCookie } from "./cookies.js";

export function requireAuthentication(params: {
  authService: AuthService;
  cookieName: string;
}) {
  return async (
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
  };
}
