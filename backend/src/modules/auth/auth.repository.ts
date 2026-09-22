import type { PrismaClient } from "@prisma/client";
import type {
  AuthRepository,
  StoredSession,
  StoredUser,
} from "./auth.types.js";
import type { PermissionCache } from "./permissionCache.js";

export class PrismaAuthRepository implements AuthRepository {
  public constructor(
    private readonly prisma: PrismaClient,
    /// Shared with the access service, which invalidates it on every role,
    /// permission or user-role change.
    private readonly permissionCache?: PermissionCache,
  ) {}

  public async findUserByEmail(email: string): Promise<StoredUser | null> {
    return this.prisma.user.findUnique({
      where: {
        email,
      },
    });
  }

  public async findEffectivePermissionKeys(userId: string): Promise<string[]> {
    const cached = this.permissionCache?.get(userId);
    if (cached) {
      return cached;
    }

    const keys = await this.loadEffectivePermissionKeys(userId);
    this.permissionCache?.set(userId, keys);
    return keys;
  }

  private async loadEffectivePermissionKeys(userId: string): Promise<string[]> {
    const grants = await this.prisma.rolePermission.findMany({
      where: {
        role: {
          isActive: true,
          users: {
            some: {
              userId,
            },
          },
        },
      },
      select: {
        permissionKey: true,
      },
      distinct: ["permissionKey"],
      orderBy: {
        permissionKey: "asc",
      },
    });

    return grants.map((grant) => grant.permissionKey);
  }

  public async createSession(params: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.authSession.create({
      data: params,
    });
  }

  public async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<StoredSession | null> {
    return this.prisma.authSession.findUnique({
      where: {
        tokenHash,
      },
      include: {
        user: true,
      },
    });
  }

  public async touchSession(sessionId: string): Promise<void> {
    await this.prisma.authSession.update({
      where: {
        id: sessionId,
      },
      data: {
        lastUsedAt: new Date(),
      },
    });
  }

  public async revokeSession(tokenHash: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  public async createUser(params: {
    email: string;
    displayName: string;
    passwordHash: string;
  }): Promise<StoredUser> {
    return this.prisma.user.create({
      data: {
        email: params.email,
        displayName: params.displayName,
        passwordHash: params.passwordHash,
      },
    });
  }
}
