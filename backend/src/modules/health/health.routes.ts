import { Router } from "express";
import { ok } from "../../shared/apiResponse.js";
import { getCorrelationId } from "../../shared/correlation.js";
import type { HealthCheck } from "./health.service.js";

export function healthRouter(healthCheck: HealthCheck): Router {
  const router = Router();

  router.get("/", async (_request, response, next) => {
    try {
      const health = await healthCheck();
      const statusCode = health.status === "ok" ? 200 : 503;

      response.status(statusCode).json(ok(health, getCorrelationId(response)));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
