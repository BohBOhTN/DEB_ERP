import { ExpenseStatus } from "@prisma/client";
import { Router, type Response } from "express";
import { z } from "zod";
import { requirePermission } from "../access/permission.middleware.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SessionCookieConfig } from "../auth/cookies.js";
import { ok } from "../../shared/apiResponse.js";
import { getCorrelationId } from "../../shared/correlation.js";
import type { ExpensesService } from "./expenses.service.js";

const moneyTnd = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,3})?$/);

const categoryListQuerySchema = z.object({
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

const createCategorySchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
});

const updateCategorySchema = z.object({
  version: z.number().int().positive(),
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

const expenseListQuerySchema = z.object({
  categoryId: z.string().trim().min(1).optional(),
  status: z.nativeEnum(ExpenseStatus).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const totalsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const createExpenseSchema = z.object({
  categoryId: z.string().trim().min(1),
  expenseDate: z.coerce.date(),
  amountTnd: moneyTnd,
  description: z.string().trim().min(1),
  externalReference: z.string().optional(),
  notes: z.string().optional(),
  responsibleUserId: z.string().trim().min(1).optional(),
  post: z.boolean().optional(),
});

const updateExpenseSchema = z.object({
  version: z.number().int().positive(),
  categoryId: z.string().trim().min(1).optional(),
  expenseDate: z.coerce.date().optional(),
  amountTnd: moneyTnd.optional(),
  description: z.string().trim().min(1).optional(),
  externalReference: z.string().optional(),
  notes: z.string().optional(),
});

const postExpenseSchema = z.object({
  version: z.number().int().positive(),
  postedAt: z.coerce.date(),
});

const cancelExpenseSchema = z.object({
  version: z.number().int().positive(),
  cancelledAt: z.coerce.date(),
  reason: z.string().trim().min(1),
});

export function expensesRouter(params: {
  authService: AuthService;
  cookie: SessionCookieConfig;
  expensesService: ExpensesService;
}): Router {
  const router = Router();
  router.use(
    requireAuthentication({
      authService: params.authService,
      cookieName: params.cookie.name,
    }),
  );

  // Recording an expense needs to pick a category, so the read is open to
  // anyone who may view or create expenses as well as to category managers.
  router.get(
    "/expense-categories",
    requirePermission("expenses.view"),
    async (request, response, next) => {
      try {
        const query = categoryListQuerySchema.parse(request.query);
        const expenseCategories =
          await params.expensesService.listCategories(query);
        response.json(ok({ expenseCategories }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/expense-categories",
    requirePermission("expense_categories.manage"),
    async (request, response, next) => {
      try {
        const body = createCategorySchema.parse(request.body);
        const expenseCategory = await params.expensesService.createCategory(
          body,
          actorFromResponse(response),
        );
        response
          .status(201)
          .json(ok({ expenseCategory }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/expense-categories/:categoryId",
    requirePermission("expense_categories.manage"),
    async (request, response, next) => {
      try {
        const body = updateCategorySchema.parse(request.body);
        const expenseCategory = await params.expensesService.updateCategory(
          parseRouteParam(request.params.categoryId),
          body,
          actorFromResponse(response),
        );
        response.json(ok({ expenseCategory }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/expenses",
    requirePermission("expenses.view"),
    async (request, response, next) => {
      try {
        const query = expenseListQuerySchema.parse(request.query);
        const expenses = await params.expensesService.listExpenses(query);
        response.json(ok({ expenses }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/expense-totals",
    requirePermission("expenses.view"),
    async (request, response, next) => {
      try {
        const query = totalsQuerySchema.parse(request.query);
        const expenseTotals =
          await params.expensesService.getExpenseTotals(query);
        response.json(ok({ expenseTotals }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/expenses",
    requirePermission("expenses.create"),
    async (request, response, next) => {
      try {
        const body = createExpenseSchema.parse(request.body);
        const result = await params.expensesService.createExpense(
          body,
          actorFromResponse(response),
        );
        response.status(201).json(ok(result, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/expenses/:expenseId",
    requirePermission("expenses.create"),
    async (request, response, next) => {
      try {
        const body = updateExpenseSchema.parse(request.body);
        const result = await params.expensesService.updateExpense(
          parseRouteParam(request.params.expenseId),
          body,
          actorFromResponse(response),
        );
        response.json(ok(result, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/expenses/:expenseId/post",
    requirePermission("expenses.create"),
    async (request, response, next) => {
      try {
        const body = postExpenseSchema.parse(request.body);
        const result = await params.expensesService.postExpense(
          parseRouteParam(request.params.expenseId),
          body,
          actorFromResponse(response),
        );
        response.json(ok(result, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/expenses/:expenseId/cancel",
    requirePermission("expenses.cancel"),
    async (request, response, next) => {
      try {
        const body = cancelExpenseSchema.parse(request.body);
        const result = await params.expensesService.cancelExpense(
          parseRouteParam(request.params.expenseId),
          body,
          actorFromResponse(response),
        );
        response.json(ok(result, getCorrelationId(response)));
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
