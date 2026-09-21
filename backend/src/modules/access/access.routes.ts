import { Router, type Response } from "express";
import { z } from "zod";
import { ok } from "../../shared/apiResponse.js";
import { AppError } from "../../shared/appError.js";
import { getCorrelationId } from "../../shared/correlation.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SessionCookieConfig } from "../auth/cookies.js";
import type { AccessService } from "./access.service.js";
import { requirePermission } from "./permission.middleware.js";

const createRoleSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  permissionKeys: z.array(z.string()).default([]),
});

const updateRoleSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

const replacePermissionsSchema = z.object({
  permissionKeys: z.array(z.string()),
});

const replaceUserRolesSchema = z.object({
  roleIds: z.array(z.string()),
});

const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1),
  password: z.string().min(8),
  roleIds: z.array(z.string()).default([]),
});

const userActivationSchema = z.object({
  isActive: z.boolean(),
});

export function accessRouter(params: {
  authService: AuthService;
  cookie: SessionCookieConfig;
  accessService: AccessService;
}): Router {
  const router = Router();
  router.use(
    requireAuthentication({
      authService: params.authService,
      cookieName: params.cookie.name,
    }),
  );

  router.get(
    "/permissions",
    requirePermission("roles.view"),
    async (_request, response, next) => {
      try {
        const permissions = await params.accessService.listPermissions();
        response.json(ok({ permissions }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/roles",
    requirePermission("roles.view"),
    async (_request, response, next) => {
      try {
        const roles = await params.accessService.listRoles();
        response.json(
          ok({ roles: roles.map(serializeRole) }, getCorrelationId(response)),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/roles",
    requirePermission("roles.create"),
    async (request, response, next) => {
      try {
        const body = createRoleSchema.parse(request.body);
        const role = await params.accessService.createRole(
          body,
          actorFromResponse(response),
        );

        response
          .status(201)
          .json(ok({ role: serializeRole(role) }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/roles/:roleId",
    requirePermission("roles.update"),
    async (request, response, next) => {
      try {
        const body = updateRoleSchema.parse(request.body);
        const role = await params.accessService.updateRole(
          parseRouteParam(request.params.roleId),
          body,
          actorFromResponse(response),
        );

        response.json(
          ok({ role: serializeRole(role) }, getCorrelationId(response)),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/roles/:roleId/permissions",
    requirePermission("roles.assign_permissions"),
    async (request, response, next) => {
      try {
        const body = replacePermissionsSchema.parse(request.body);
        const role = await params.accessService.replaceRolePermissions(
          parseRouteParam(request.params.roleId),
          body.permissionKeys,
          actorFromResponse(response),
        );

        response.json(
          ok({ role: serializeRole(role) }, getCorrelationId(response)),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/users",
    requirePermission("users.view"),
    async (_request, response, next) => {
      try {
        const users = await params.accessService.listUsers();
        response.json(
          ok({ users: users.map(serializeUser) }, getCorrelationId(response)),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/users",
    requirePermission("users.create"),
    async (request, response, next) => {
      try {
        const body = createUserSchema.parse(request.body);
        const user = await params.accessService.createUser(
          body,
          actorFromResponse(response),
        );

        response
          .status(201)
          .json(ok({ user: serializeUser(user) }, getCorrelationId(response)));
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/users/:userId/roles",
    requirePermission("users.assign_roles"),
    async (request, response, next) => {
      try {
        const body = replaceUserRolesSchema.parse(request.body);
        const user = await params.accessService.replaceUserRoles(
          parseRouteParam(request.params.userId),
          body.roleIds,
          actorFromResponse(response),
        );

        response.json(
          ok({ user: serializeUser(user) }, getCorrelationId(response)),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/users/:userId/activation",
    requirePermission("users.activate"),
    async (request, response, next) => {
      try {
        const body = userActivationSchema.parse(request.body);
        const user = await params.accessService.setUserActivation(
          parseRouteParam(request.params.userId),
          body.isActive,
          actorFromResponse(response),
        );

        response.json(
          ok(
            {
              user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                isActive: user.isActive,
              },
            },
            getCorrelationId(response),
          ),
        );
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
  if (typeof value !== "string" || value.length === 0) {
    throw new AppError({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "Les donnees saisies sont invalides.",
    });
  }

  return value;
}

function serializeRole(role: {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  systemKey: string | null;
  permissions: { permissionKey: string }[];
}) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isActive: role.isActive,
    isSystem: role.isSystem,
    systemKey: role.systemKey,
    permissionKeys: role.permissions.map((item) => item.permissionKey).sort(),
  };
}

function serializeUser(user: {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  roles: {
    role: {
      id: string;
      name: string;
      isActive: boolean;
      isSystem: boolean;
      systemKey: string | null;
    };
  }[];
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isActive: user.isActive,
    roles: user.roles.map((item) => item.role),
  };
}
