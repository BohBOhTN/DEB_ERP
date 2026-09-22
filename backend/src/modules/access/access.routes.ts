import { Router, type Response } from "express";
import { z } from "zod";
import { okFor } from "../../shared/apiResponse.js";
import { AppError } from "../../shared/appError.js";
import { getApiVersion } from "../../shared/apiVersion.js";
import { getCorrelationId } from "../../shared/correlation.js";
import {
  pageFields,
  searchFields,
  sortField,
  withSearch,
} from "../../shared/listQuery.js";
import { requireAuthentication } from "../auth/auth.middleware.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SessionCookieConfig } from "../auth/cookies.js";
import type { AccessService } from "./access.service.js";
import { requirePermission } from "./permission.middleware.js";

export const createRoleSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  permissionKeys: z.array(z.string()).default([]),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const replacePermissionsSchema = z.object({
  permissionKeys: z.array(z.string()),
});

export const replaceUserRolesSchema = z.object({
  roleIds: z.array(z.string()),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1),
  password: z.string().min(8),
  roleIds: z.array(z.string()).default([]),
});

export const userActivationSchema = z.object({
  isActive: z.boolean(),
});

export const userListQuerySchema = z.object({
  ...pageFields,
  ...searchFields,
  sort: sortField(["displayName", "email", "createdAt"]),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  roleId: z.string().trim().min(1).optional(),
});

export const updateUserSchema = z
  .object({
    displayName: z.string().trim().min(1).optional(),
    email: z.string().email().optional(),
    version: z.number().int().positive(),
  })
  .refine(
    (body) => body.displayName !== undefined || body.email !== undefined,
    { message: "Aucune modification fournie." },
  );

export const passwordResetSchema = z.object({
  password: z.string().min(8),
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
        const [permissions, groups] = await Promise.all([
          params.accessService.listPermissions(),
          params.accessService.listPermissionGroups(),
        ]);
        response.json(okFor(response, { permissions, groups }));
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
        response.json(okFor(response, { roles: roles.map(serializeRole) }));
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
          .json(okFor(response, { role: serializeRole(role) }));
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

        response.json(okFor(response, { role: serializeRole(role) }));
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

        response.json(okFor(response, { role: serializeRole(role) }));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/users",
    requirePermission("users.view"),
    async (request, response, next) => {
      try {
        if (getApiVersion(response) === 1) {
          const query = withSearch(userListQuerySchema.parse(request.query));
          const page = await params.accessService.searchUsers(query);
          response.json(
            okFor(response, {
              users: { ...page, items: page.items.map(serializeUser) },
            }),
          );
          return;
        }

        const users = await params.accessService.listUsers();
        response.json(okFor(response, { users: users.map(serializeUser) }));
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
          .json(okFor(response, { user: serializeUser(user) }));
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/users/:userId",
    requirePermission("users.update"),
    async (request, response, next) => {
      try {
        const body = updateUserSchema.parse(request.body);
        const user = await params.accessService.updateUser(
          parseRouteParam(request.params.userId),
          body,
          actorFromResponse(response),
        );

        response.json(okFor(response, { user: serializeUser(user) }));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/users/:userId/password-reset",
    requirePermission("users.reset_password"),
    async (request, response, next) => {
      try {
        const body = passwordResetSchema.parse(request.body);
        const user = await params.accessService.resetPassword(
          parseRouteParam(request.params.userId),
          body,
          actorFromResponse(response),
        );

        response.json(okFor(response, { user: serializeUser(user) }));
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

        response.json(okFor(response, { user: serializeUser(user) }));
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
          okFor(response, {
            user: {
              id: user.id,
              email: user.email,
              displayName: user.displayName,
              isActive: user.isActive,
              version: user.version,
            },
          }),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/users/:userId",
    requirePermission("users.view"),
    async (request, response, next) => {
      try {
        const user = await params.accessService.getUser(
          parseRouteParam(request.params.userId),
        );
        response.json(okFor(response, { user: serializeUser(user) }));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/roles/:roleId",
    requirePermission("roles.view"),
    async (request, response, next) => {
      try {
        const role = await params.accessService.getRole(
          parseRouteParam(request.params.roleId),
        );
        response.json(okFor(response, { role: serializeRole(role) }));
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
      message: "Les données saisies sont invalides.",
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
  _count?: { permissions: number; users: number };
}) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isActive: role.isActive,
    isSystem: role.isSystem,
    systemKey: role.systemKey,
    permissionKeys: role.permissions.map((item) => item.permissionKey).sort(),
    permissionCount: role._count?.permissions ?? role.permissions.length,
    userCount: role._count?.users ?? null,
  };
}

function serializeUser(user: {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  version?: number;
  createdAt?: Date;
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
    version: user.version ?? null,
    createdAt: user.createdAt ?? null,
    roles: user.roles.map((item) => item.role),
  };
}
