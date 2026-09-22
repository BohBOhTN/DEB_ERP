import { Router, type Response } from "express";
import { z } from "zod";
import { requirePermission } from "../access/permission.middleware.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SessionCookieConfig } from "../auth/cookies.js";
import { okFor } from "../../shared/apiResponse.js";
import { pageFields, sortField } from "../../shared/listQuery.js";
import { getCorrelationId } from "../../shared/correlation.js";
import type { SimulationService } from "./simulation.service.js";

const moneyTnd = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/);

const quantity = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/);

const ingredientSchema = z.object({
  rawMaterialId: z.string().trim().min(1).optional(),
  ingredientName: z.string().trim().min(1).optional(),
  enteredQuantity: quantity,
  enteredUnitId: z.string().trim().min(1),
  unitPriceTnd: moneyTnd,
  priceBasisUnitId: z.string().trim().min(1),
  conversionFactorToBase: quantity.optional(),
});

const simulationBodySchema = z.object({
  name: z.string().trim().min(1),
  targetProductId: z.string().trim().min(1).optional(),
  outputQuantity: quantity,
  outputUnitId: z.string().trim().min(1),
  notes: z.string().optional(),
  ingredients: z.array(ingredientSchema).min(1),
});

const updateSimulationSchema = simulationBodySchema.extend({
  version: z.number().int().positive(),
});

const duplicateSchema = z.object({
  name: z.string().trim().min(1).optional(),
});

const pageQuerySchema = z.object({
  sort: sortField(["updatedAt", "name"]),
  ...pageFields,
});

export function simulationRouter(params: {
  authService: AuthService;
  cookie: SessionCookieConfig;
  simulationService: SimulationService;
}): Router {
  const router = Router();
  router.use(
    requireAuthentication({
      authService: params.authService,
      cookieName: params.cookie.name,
    }),
  );

  router.get(
    "/cost-simulations",
    requirePermission("simulations.view"),
    async (request, response, next) => {
      try {
        const query = pageQuerySchema.parse(request.query);
        const simulations =
          await params.simulationService.listSimulations(query);
        response.json(okFor(response, { simulations }));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/cost-simulations/:simulationId",
    requirePermission("simulations.view"),
    async (request, response, next) => {
      try {
        const simulation = await params.simulationService.getSimulation(
          parseRouteParam(request.params.simulationId),
        );
        response.json(okFor(response, { simulation }));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/cost-simulations",
    requirePermission("simulations.create"),
    async (request, response, next) => {
      try {
        const body = simulationBodySchema.parse(request.body);
        const result = await params.simulationService.createSimulation(
          body,
          actorFromResponse(response),
        );
        response.status(201).json(okFor(response, result));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/cost-simulations/:simulationId/duplicate",
    requirePermission("simulations.create"),
    async (request, response, next) => {
      try {
        const body = duplicateSchema.parse(request.body ?? {});
        const result = await params.simulationService.duplicateSimulation(
          parseRouteParam(request.params.simulationId),
          body,
          actorFromResponse(response),
        );
        response.status(201).json(okFor(response, result));
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/cost-simulations/:simulationId",
    requirePermission("simulations.update"),
    async (request, response, next) => {
      try {
        const body = updateSimulationSchema.parse(request.body);
        const result = await params.simulationService.updateSimulation(
          parseRouteParam(request.params.simulationId),
          body,
          actorFromResponse(response),
        );
        response.json(okFor(response, result));
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    "/cost-simulations/:simulationId",
    requirePermission("simulations.delete"),
    async (request, response, next) => {
      try {
        const result = await params.simulationService.deleteSimulation(
          parseRouteParam(request.params.simulationId),
          actorFromResponse(response),
        );
        response.json(okFor(response, result));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

function actorFromResponse(response: Response) {
  const user = response.locals.currentUser as { id: string };

  return {
    actorUserId: user.id,
    correlationId: getCorrelationId(response),
  };
}

function parseRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
