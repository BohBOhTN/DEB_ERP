import { Router, type RequestHandler } from "express";
import { okFor } from "../../shared/apiResponse.js";
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

      response.status(statusCode).json(okFor(response, health));
    } catch (error) {
      next(error);
    }
  };

  // `/` stays the readiness probe for the V1 frontend and existing monitors.
  router.get("/", ready);
  router.get("/ready", ready);
  router.get("/live", (_request, response) => {
    response.json(okFor(response, livenessCheck()));
  });

  return router;
}
