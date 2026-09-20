import { Router } from "express";
import { z } from "zod";
import { ok } from "../../shared/apiResponse.js";
import { getCorrelationId } from "../../shared/correlation.js";
import type { AuthService } from "./auth.service.js";
import {
  clearSessionCookie,
  readCookie,
  setSessionCookie,
  type SessionCookieConfig,
} from "./cookies.js";
import { createRateLimiter } from "./rateLimit.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function authRouter(params: {
  authService: AuthService;
  cookie: SessionCookieConfig;
  rateLimit: {
    maxAttempts: number;
    windowMs: number;
  };
}): Router {
  const router = Router();
  const limitLogin = createRateLimiter(params.rateLimit);

  router.post("/login", limitLogin, async (request, response, next) => {
    try {
      const body = loginSchema.parse(request.body);
      const result = await params.authService.login(body);

      setSessionCookie(response, params.cookie, result.sessionToken);

      response.json(
        ok(
          {
            user: result.user,
            expiresAt: result.expiresAt.toISOString(),
          },
          getCorrelationId(response),
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.get("/me", async (request, response, next) => {
    try {
      const user = await params.authService.getCurrentUser(
        readCookie(request, params.cookie.name),
      );

      response.json(ok({ user }, getCorrelationId(response)));
    } catch (error) {
      clearSessionCookie(response, params.cookie);
      next(error);
    }
  });

  router.post("/logout", async (request, response, next) => {
    try {
      await params.authService.logout(readCookie(request, params.cookie.name));
      clearSessionCookie(response, params.cookie);
      response.json(ok({ success: true }, getCorrelationId(response)));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
