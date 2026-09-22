import { AppError } from "../../shared/appError.js";
import type {
  AuthenticatedUser,
  AuthRepository,
  StoredUser,
} from "./auth.types.js";
import { hashPassword, verifyPassword } from "./password.service.js";
import { createSessionToken, hashSessionToken } from "./token.service.js";

const genericLoginMessage = "Identifiants invalides.";

/// AUD-002 asks every audited event for an actor, an action, an entity and a
/// correlation id. Authentication events are recorded through this sink rather
/// than by giving AuthService a database, so the service stays testable against
/// an in-memory repository.
export interface SecurityAuditRecorder {
  record(event: {
    actorUserId?: string;
    action: string;
    entity: string;
    targetId?: string;
    reason?: string;
  }): Promise<void>;
}

export interface AuthServiceOptions {
  /// A session's `lastUsedAt` is refreshed at most this often. Writing it on
  /// every request turned the hottest read path into a write path.
  touchIntervalMs?: number;
}

const defaultTouchIntervalMs = 5 * 60 * 1000;

export class AuthService {
  private readonly touchIntervalMs: number;

  public constructor(
    private readonly repository: AuthRepository,
    private readonly sessionTtlMinutes: number,
    private readonly securityAudit?: SecurityAuditRecorder,
    options: AuthServiceOptions = {},
  ) {
    this.touchIntervalMs = options.touchIntervalMs ?? defaultTouchIntervalMs;
  }

  public async login(params: { email: string; password: string }): Promise<{
    user: AuthenticatedUser;
    sessionToken: string;
    expiresAt: Date;
  }> {
    const email = normalizeEmail(params.email);
    const user = await this.repository.findUserByEmail(email);

    if (!user) {
      // The submitted address belongs to no account. It is attacker-controlled
      // text, so it is counted but not stored.
      await this.recordSecurityEvent({
        action: "auth.login_failed",
        entity: "user",
        reason: "unknown_email",
      });
      throw invalidCredentials();
    }

    const passwordMatches = await verifyPassword(
      params.password,
      user.passwordHash,
    );

    if (!passwordMatches || !user.isActive) {
      await this.recordSecurityEvent({
        actorUserId: user.id,
        action: "auth.login_failed",
        entity: "user",
        targetId: user.id,
        reason: passwordMatches ? "inactive_user" : "invalid_password",
      });
      throw invalidCredentials();
    }

    const sessionToken = createSessionToken();
    const expiresAt = new Date(Date.now() + this.sessionTtlMinutes * 60 * 1000);

    await this.repository.createSession({
      userId: user.id,
      tokenHash: hashSessionToken(sessionToken),
      expiresAt,
    });

    await this.recordSecurityEvent({
      actorUserId: user.id,
      action: "auth.login",
      entity: "user",
      targetId: user.id,
    });

    return {
      user: await this.toAuthenticatedUser(user),
      sessionToken,
      expiresAt,
    };
  }

  public async getCurrentUser(
    sessionToken: string | undefined,
  ): Promise<AuthenticatedUser> {
    if (!sessionToken) {
      throw authenticationRequired();
    }

    const session = await this.repository.findSessionByTokenHash(
      hashSessionToken(sessionToken),
    );

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      !session.user.isActive
    ) {
      throw authenticationRequired();
    }

    const lastUsedAt = session.lastUsedAt?.getTime();
    if (
      lastUsedAt === undefined ||
      lastUsedAt === null ||
      Date.now() - lastUsedAt >= this.touchIntervalMs
    ) {
      await this.repository.touchSession(session.id);
    }

    return this.toAuthenticatedUser(session.user);
  }

  public async logout(sessionToken: string | undefined): Promise<void> {
    if (!sessionToken) {
      return;
    }

    const tokenHash = hashSessionToken(sessionToken);
    const session = await this.repository.findSessionByTokenHash(tokenHash);

    await this.repository.revokeSession(tokenHash);

    if (session) {
      await this.recordSecurityEvent({
        actorUserId: session.userId,
        action: "auth.logout",
        entity: "user",
        targetId: session.userId,
      });
    }
  }

  /// Auditing must never break the request it describes, so a recorder failure
  /// is swallowed rather than turned into a failed login or logout.
  private async recordSecurityEvent(event: {
    actorUserId?: string;
    action: string;
    entity: string;
    targetId?: string;
    reason?: string;
  }): Promise<void> {
    if (!this.securityAudit) {
      return;
    }

    try {
      await this.securityAudit.record(event);
    } catch {
      return;
    }
  }

  public async createUser(params: {
    email: string;
    displayName: string;
    password: string;
  }): Promise<AuthenticatedUser> {
    const user = await this.repository.createUser({
      email: normalizeEmail(params.email),
      displayName: params.displayName.trim(),
      passwordHash: await hashPassword(params.password),
    });

    return this.toAuthenticatedUser(user);
  }

  private async toAuthenticatedUser(
    user: StoredUser,
  ): Promise<AuthenticatedUser> {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      effectivePermissions: await this.repository.findEffectivePermissionKeys(
        user.id,
      ),
    };
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function authenticationRequired(): AppError {
  return new AppError({
    statusCode: 401,
    code: "AUTHENTICATION_REQUIRED",
    message: "Votre session n'est plus valide.",
  });
}

function invalidCredentials(): AppError {
  return new AppError({
    statusCode: 401,
    code: "AUTHENTICATION_REQUIRED",
    message: genericLoginMessage,
  });
}
