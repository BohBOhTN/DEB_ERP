import { Router, type Response } from "express";
import type { IncomingHttpHeaders } from "node:http";
import { z } from "zod";
import { requirePermission } from "../access/permission.middleware.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SessionCookieConfig } from "../auth/cookies.js";
import { ok } from "../../shared/apiResponse.js";
import { AppError } from "../../shared/appError.js";
import { getCorrelationId } from "../../shared/correlation.js";
import type { CustomersService } from "./customers.service.js";

const listQuerySchema = z.object({
  search: z.string().trim().optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const pageQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const paymentListQuerySchema = pageQuerySchema.extend({
  customerId: z.string().trim().min(1).optional(),
});

const moneyTnd = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/);

const createCustomerSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
  taxIdentifier: z.string().optional(),
  notes: z.string().optional(),
});

const updateCustomerSchema = z.object({
  version: z.number().int().positive(),
  name: z.string().trim().min(1).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  taxIdentifier: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});

const createCustomerPaymentSchema = z.object({
  customerId: z.string().trim().min(1),
  paidAt: z.coerce.date(),
  amountTnd: moneyTnd,
  reference: z.string().optional(),
  notes: z.string().optional(),
  collectedAtPos: z.boolean().optional(),
  allocations: z
    .array(
      z.object({
        saleId: z.string().trim().min(1),
        amountTnd: moneyTnd,
      }),
    )
    .default([]),
});

export function customersRouter(params: {
  authService: AuthService;
  cookie: SessionCookieConfig;
  customersService: CustomersService;
}): Router {
  const router = Router();
  router.use(
    requireAuthentication({
      authService: params.authService,
      cookieName: params.cookie.name,
    }),
  );

  router.get(
    "/customers",
    requirePermission("customers.view"),
    async (request, response, next) => {
      try {
        const query = listQuerySchema.parse(request.query);
        const customers = await params.customersService.listCustomers(query);
        response.json(ok({ customers }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/customers",
    requirePermission("customers.create"),
    async (request, response, next) => {
      try {
        const body = createCustomerSchema.parse(request.body);
        const customer = await params.customersService.createCustomer(
          body,
          actorFromResponse(response),
        );
        response.status(201).json(ok({ customer }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/customers/:customerId",
    requirePermission("customers.update"),
    async (request, response, next) => {
      try {
        const body = updateCustomerSchema.parse(request.body);
        const customer = await params.customersService.updateCustomer(
          parseRouteParam(request.params.customerId),
          body,
          actorFromResponse(response),
        );
        response.json(ok({ customer }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/customer-balances",
    requirePermission("customer_balances.view"),
    async (request, response, next) => {
      try {
        const query = pageQuerySchema.parse(request.query);
        const customerBalances =
          await params.customersService.listCustomerBalances(query);
        response.json(ok({ customerBalances }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/customers/:customerId/statement",
    requirePermission("customer_balances.view"),
    async (request, response, next) => {
      try {
        const statement = await params.customersService.getCustomerStatement(
          parseRouteParam(request.params.customerId),
        );
        response.json(ok({ statement }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/customer-payments",
    requirePermission("customer_payments.view"),
    async (request, response, next) => {
      try {
        const query = paymentListQuerySchema.parse(request.query);
        const customerPayments =
          await params.customersService.listCustomerPayments(query);
        response.json(ok({ customerPayments }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/customer-payments",
    requirePermission("customer_payments.create"),
    async (request, response, next) => {
      try {
        const body = createCustomerPaymentSchema.parse(request.body);
        const result = await params.customersService.createCustomerPayment(
          {
            ...body,
            idempotencyKey: readIdempotencyKey(request.headers),
          },
          actorFromResponse(response),
        );
        response.status(201).json(ok(result, getCorrelationId(response)));
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

function readIdempotencyKey(headers: IncomingHttpHeaders): string {
  const value = headers["idempotency-key"];

  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  if (!value) {
    throw new AppError({
      statusCode: 400,
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: "Une cle d'idempotence est requise.",
    });
  }

  return value;
}
