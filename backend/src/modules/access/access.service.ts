import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../shared/appError.js";
import {
  permissionCatalog,
  permissionKeys,
  SUPER_ADMIN_SYSTEM_KEY,
} from "./permissions.js";
import { hashPassword } from "../auth/password.service.js";
import { normalizeEmail } from "../auth/auth.service.js";

export interface ActorContext {
  actorUserId: string;
  correlationId?: string;
}

export class AccessService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async bootstrapSystemAccess(): Promise<void> {
    await this.seedPermissionCatalog();

    const superAdminRole = await this.prisma.role.upsert({
      where: {
        systemKey: SUPER_ADMIN_SYSTEM_KEY,
      },
      create: {
        name: "Super Admin",
        description: "Protected full-access system role",
        isSystem: true,
        systemKey: SUPER_ADMIN_SYSTEM_KEY,
      },
      update: {
        isActive: true,
        isSystem: true,
        name: "Super Admin",
      },
    });

    await this.prisma.rolePermission.createMany({
      data: permissionKeys.map((permissionKey) => ({
        roleId: superAdminRole.id,
        permissionKey,
      })),
      skipDuplicates: true,
    });

    const superAdminAssignments = await this.prisma.userRole.count({
      where: {
        roleId: superAdminRole.id,
        user: {
          isActive: true,
        },
      },
    });

    if (superAdminAssignments > 0) {
      return;
    }

    const firstActiveUser = await this.prisma.user.findFirst({
      where: {
        isActive: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (!firstActiveUser) {
      return;
    }

    await this.prisma.userRole.create({
      data: {
        userId: firstActiveUser.id,
        roleId: superAdminRole.id,
      },
    });

    await this.audit({
      action: "user_role.bootstrap_super_admin",
      entity: "user",
      targetId: firstActiveUser.id,
      after: {
        roleId: superAdminRole.id,
        systemKey: SUPER_ADMIN_SYSTEM_KEY,
      },
    });
  }

  public async seedPermissionCatalog(): Promise<void> {
    for (const item of permissionCatalog) {
      await this.prisma.permission.upsert({
        where: {
          key: item.key,
        },
        create: item,
        update: {
          module: item.module,
          labelFr: item.labelFr,
          descriptionFr: item.descriptionFr,
        },
      });
    }
  }

  public async listPermissions() {
    await this.seedPermissionCatalog();

    return this.prisma.permission.findMany({
      orderBy: [{ module: "asc" }, { key: "asc" }],
    });
  }

  public async listRoles() {
    return this.prisma.role.findMany({
      include: {
        permissions: {
          select: {
            permissionKey: true,
          },
          orderBy: {
            permissionKey: "asc",
          },
        },
      },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
  }

  public async createRole(
    params: {
      name: string;
      description?: string;
      permissionKeys: string[];
    },
    actor: ActorContext,
  ) {
    const validKeys = await this.validatePermissionKeys(params.permissionKeys);
    const role = await this.prisma.role.create({
      data: {
        name: params.name.trim(),
        description: emptyToNull(params.description),
        permissions: {
          createMany: {
            data: validKeys.map((permissionKey) => ({ permissionKey })),
            skipDuplicates: true,
          },
        },
      },
      include: {
        permissions: true,
      },
    });

    await this.audit({
      actor,
      action: "role.create",
      entity: "role",
      targetId: role.id,
      after: {
        name: role.name,
        permissionKeys: validKeys,
      },
    });

    return role;
  }

  public async updateRole(
    roleId: string,
    params: {
      name?: string;
      description?: string;
      isActive?: boolean;
    },
    actor: ActorContext,
  ) {
    const existing = await this.findRoleOrThrow(roleId);

    if (existing.isSystem && params.isActive === false) {
      throw protectedRoleError();
    }

    const role = await this.prisma.role.update({
      where: {
        id: roleId,
      },
      data: {
        ...(params.name !== undefined ? { name: params.name.trim() } : {}),
        ...(params.description !== undefined
          ? { description: emptyToNull(params.description) }
          : {}),
        ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      },
      include: {
        permissions: true,
      },
    });

    await this.audit({
      actor,
      action: "role.update",
      entity: "role",
      targetId: role.id,
      before: serializeRole(existing),
      after: serializeRole(role),
    });

    return role;
  }

  public async replaceRolePermissions(
    roleId: string,
    nextPermissionKeys: string[],
    actor: ActorContext,
  ) {
    const role = await this.findRoleOrThrow(roleId);

    if (role.isSystem) {
      throw protectedRoleError();
    }

    const validKeys = await this.validatePermissionKeys(nextPermissionKeys);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: {
          roleId,
        },
      });
      await tx.rolePermission.createMany({
        data: validKeys.map((permissionKey) => ({
          roleId,
          permissionKey,
        })),
        skipDuplicates: true,
      });

      return tx.role.findUniqueOrThrow({
        where: {
          id: roleId,
        },
        include: {
          permissions: true,
        },
      });
    });

    await this.audit({
      actor,
      action: "role.assign_permissions",
      entity: "role",
      targetId: roleId,
      before: {
        permissionKeys: role.permissions.map((item) => item.permissionKey),
      },
      after: {
        permissionKeys: validKeys,
      },
    });

    return result;
  }

  public async listUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        isActive: true,
        roles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
                isActive: true,
                isSystem: true,
                systemKey: true,
              },
            },
          },
          orderBy: {
            role: {
              name: "asc",
            },
          },
        },
      },
      orderBy: {
        displayName: "asc",
      },
    });
  }

  public async createUser(
    params: {
      email: string;
      displayName: string;
      password: string;
      roleIds: string[];
    },
    actor: ActorContext,
  ) {
    const validRoleIds = await this.validateRoleIds(params.roleIds);
    const user = await this.prisma.user.create({
      data: {
        email: normalizeEmail(params.email),
        displayName: params.displayName.trim(),
        passwordHash: await hashPassword(params.password),
        roles: {
          createMany: {
            data: validRoleIds.map((roleId) => ({ roleId })),
            skipDuplicates: true,
          },
        },
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        isActive: true,
        roles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
                isActive: true,
                isSystem: true,
                systemKey: true,
              },
            },
          },
        },
      },
    });

    await this.audit({
      actor,
      action: "user.create",
      entity: "user",
      targetId: user.id,
      after: {
        email: user.email,
        displayName: user.displayName,
        roleIds: validRoleIds,
      },
    });

    return user;
  }

  public async replaceUserRoles(
    userId: string,
    roleIds: string[],
    actor: ActorContext,
  ) {
    await this.findUserOrThrow(userId);
    const validRoleIds = await this.validateRoleIds(roleIds);
    const before = await this.prisma.userRole.findMany({
      where: {
        userId,
      },
      select: {
        roleId: true,
      },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({
        where: {
          userId,
        },
      });
      await tx.userRole.createMany({
        data: validRoleIds.map((roleId) => ({ userId, roleId })),
        skipDuplicates: true,
      });

      return tx.user.findUniqueOrThrow({
        where: {
          id: userId,
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          isActive: true,
          roles: {
            select: {
              role: true,
            },
          },
        },
      });
    });

    await this.audit({
      actor,
      action: "user.assign_roles",
      entity: "user",
      targetId: userId,
      before: {
        roleIds: before.map((item) => item.roleId),
      },
      after: {
        roleIds: validRoleIds,
      },
    });

    return result;
  }

  public async setUserActivation(
    userId: string,
    isActive: boolean,
    actor: ActorContext,
  ) {
    const user = await this.findUserOrThrow(userId);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (!isActive && user.isActive) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('dar_el_barka_super_admin_activation'))`;

        const superAdminRole = await tx.role.findUnique({
          where: {
            systemKey: SUPER_ADMIN_SYSTEM_KEY,
          },
        });

        if (superAdminRole) {
          const targetHasSuperAdmin = await tx.userRole.findUnique({
            where: {
              userId_roleId: {
                userId,
                roleId: superAdminRole.id,
              },
            },
          });

          if (targetHasSuperAdmin) {
            const remainingActiveSuperAdmins = await tx.userRole.count({
              where: {
                roleId: superAdminRole.id,
                userId: {
                  not: userId,
                },
                user: {
                  isActive: true,
                },
              },
            });

            if (remainingActiveSuperAdmins === 0) {
              throw new AppError({
                statusCode: 409,
                code: "LAST_SUPER_ADMIN_REQUIRED",
                message:
                  "Le dernier Super Admin actif ne peut pas etre desactive.",
              });
            }
          }
        }
      }

      return tx.user.update({
        where: {
          id: userId,
        },
        data: {
          isActive,
          deactivatedAt: isActive ? null : new Date(),
          sessions: isActive
            ? undefined
            : {
                updateMany: {
                  where: {
                    revokedAt: null,
                  },
                  data: {
                    revokedAt: new Date(),
                  },
                },
              },
        },
      });
    });

    await this.audit({
      actor,
      action: isActive ? "user.activate" : "user.deactivate",
      entity: "user",
      targetId: userId,
      before: {
        isActive: user.isActive,
      },
      after: {
        isActive: updated.isActive,
      },
    });

    return updated;
  }

  private async validatePermissionKeys(keys: string[]): Promise<string[]> {
    const uniqueKeys = [...new Set(keys)];
    const count = await this.prisma.permission.count({
      where: {
        key: {
          in: uniqueKeys,
        },
      },
    });

    if (count !== uniqueKeys.length) {
      throw new AppError({
        statusCode: 400,
        code: "INVALID_PERMISSION_KEY",
        message: "Une autorisation demandee est invalide.",
      });
    }

    return uniqueKeys;
  }

  private async validateRoleIds(roleIds: string[]): Promise<string[]> {
    const uniqueRoleIds = [...new Set(roleIds)];
    const count = await this.prisma.role.count({
      where: {
        id: {
          in: uniqueRoleIds,
        },
        isActive: true,
      },
    });

    if (count !== uniqueRoleIds.length) {
      throw new AppError({
        statusCode: 400,
        code: "INVALID_ROLE_ID",
        message: "Un role demande est invalide.",
      });
    }

    return uniqueRoleIds;
  }

  private async findRoleOrThrow(roleId: string) {
    const role = await this.prisma.role.findUnique({
      where: {
        id: roleId,
      },
      include: {
        permissions: true,
      },
    });

    if (!role) {
      throw new AppError({
        statusCode: 404,
        code: "ROLE_NOT_FOUND",
        message: "Role introuvable.",
      });
    }

    return role;
  }

  private async findUserOrThrow(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new AppError({
        statusCode: 404,
        code: "USER_NOT_FOUND",
        message: "Utilisateur introuvable.",
      });
    }

    return user;
  }

  private async audit(params: {
    actor?: ActorContext;
    action: string;
    entity: string;
    targetId?: string;
    before?: unknown;
    after?: unknown;
  }): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: params.actor?.actorUserId,
        action: params.action,
        entity: params.entity,
        targetId: params.targetId,
        correlationId: params.actor?.correlationId,
        before: params.before ?? undefined,
        after: params.after ?? undefined,
      },
    });
  }
}

function protectedRoleError(): AppError {
  return new AppError({
    statusCode: 409,
    code: "PROTECTED_SYSTEM_ROLE",
    message: "Le role Super Admin protege ne peut pas etre modifie ainsi.",
  });
}

function serializeRole(role: {
  name: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  permissions: { permissionKey: string }[];
}) {
  return {
    name: role.name,
    description: role.description,
    isActive: role.isActive,
    isSystem: role.isSystem,
    permissionKeys: role.permissions.map((item) => item.permissionKey),
  };
}

function emptyToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
