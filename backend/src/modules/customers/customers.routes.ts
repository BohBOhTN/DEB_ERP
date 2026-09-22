import { Router, type Response } from "express";
import type { IncomingHttpHeaders } from "node:http";
import { z } from "zod";
import { requirePermission } from "../access/permission.middleware.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SessionCookieConfig } from "../auth/cookies.js";
import { okFor, sendCommandResult } from "../../shared/apiResponse.js";
import {
  dateRangeFields,
  pageFields,
  searchFields,
  sortField,
  withSearch,
} from "../../shared/listQuery.js";
import { AppError } from "../../shared/appError.js";
import { getCorrelationId } from "../../shared/correlation.js";
import type { CustomersService } from "./customers.service.js";

export const listQuerySchema = z.object({
  sort: sortField(["name", "createdAt"]),
  ...searchFields,
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  ...pageFields,
});

export const pageQuerySchema = z.object({
  ...pageFields,
});

export const paymentListQuerySchema = pageQuerySchema.extend({
  sort: sortField(["paidAt", "amountTnd"]),
  customerId: z.string().trim().min(1).optional(),
});

const moneyTnd = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/);

export const balanceListQuerySchema = pageQuerySchema.extend({
  ...searchFields,
  sort: z.enum(["name", "balance"]).optional(),
  minBalance: moneyTnd.optional(),
});

export const statementQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  ...dateRangeFields,
});

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().optional(),
  address: z.string().optional(),
  taxIdentifier: z.string().optional(),
  notes: z.string().optional(),
});

export const updateCustomerSchema = z.object({
  version: z.number().int().positive(),
  name: z.string().trim().min(1).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  taxIdentifier: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const createCustomerPaymentSchema = z.object({
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
        const query = withSearch(listQuerySchema.parse(request.query));
        const customers = await params.customersService.listCustomers(query);
        response.json(okFor(response, { customers }));
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
        response.status(201).json(okFor(response, { customer }));
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
        response.json(okFor(response, { customer }));
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
        const query = withSearch(balanceListQuerySchema.parse(request.query));
        const customerBalances =
          await params.customersService.listCustomerBalances(query);
        response.json(okFor(response, { customerBalances }));
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
          statementQuerySchema.parse(request.query),
        );
        response.json(okFor(response, { statement }));
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
        response.json(okFor(response, { customerPayments }));
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
        sendCommandResult(response, 201, result);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/customers/:customerId",
    requirePermission("customers.view"),
    async (request, response, next) => {
      try {
        const customer = await params.customersService.getCustomer(
          parseRouteParam(request.params.customerId),
        );
        response.json(okFor(response, { customer }));
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
      message: "Une clé d'idempotence est requise.",
    });
  }

  return value;
}
