import { Router, type RequestHandler } from "express";
import { ok } from "../../shared/apiResponse.js";
import { getCorrelationId } from "../../shared/correlation.js";
import {
  createLivenessCheck,
  type HealthCheck,
  type LivenessCheck,
} from "./health.service.js";

export function healthRouter(
  healthCheck: HealthCheck,
  livenessCheck: LivenessCheck = createLivenessCheck(),
): Router {
  const router = Router();

  const ready: RequestHandler = async (_request, response, next) => {
    try {
      const health = await healthCheck();
      const statusCode = health.status === "ok" ? 200 : 503;

      response.status(statusCode).json(ok(health, getCorrelationId(response)));
    } catch (error) {
      next(error);
    }
  };

  // `/` stays the readiness probe for the V1 frontend and existing monitors.
  router.get("/", ready);
  router.get("/ready", ready);
  router.get("/live", (_request, response) => {
    response.json(ok(livenessCheck(), getCorrelationId(response)));
  });

  return router;
}
