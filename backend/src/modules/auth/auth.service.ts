import { AppError } from "../../shared/appError.js";
import type {
  AuthenticatedUser,
  AuthRepository,
  StoredUser,
} from "./auth.types.js";
import { hashPassword, verifyPassword } from "./password.service.js";
import { createSessionToken, hashSessionToken } from "./token.service.js";

const genericLoginMessage = "Identifiants invalides.";

export class AuthService {
  public constructor(
    private readonly repository: AuthRepository,
    private readonly sessionTtlMinutes: number,
  ) {}

  public async login(params: { email: string; password: string }): Promise<{
    user: AuthenticatedUser;
    sessionToken: string;
    expiresAt: Date;
  }> {
    const email = normalizeEmail(params.email);
    const user = await this.repository.findUserByEmail(email);

    if (!user) {
      throw invalidCredentials();
    }

    const passwordMatches = await verifyPassword(
      params.password,
      user.passwordHash,
    );

    if (!passwordMatches || !user.isActive) {
      throw invalidCredentials();
    }

    const sessionToken = createSessionToken();
    const expiresAt = new Date(Date.now() + this.sessionTtlMinutes * 60 * 1000);

    await this.repository.createSession({
      userId: user.id,
      tokenHash: hashSessionToken(sessionToken),
      expiresAt,
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

    await this.repository.touchSession(session.id);

    return this.toAuthenticatedUser(session.user);
  }

  public async logout(sessionToken: string | undefined): Promise<void> {
    if (!sessionToken) {
      return;
    }

    await this.repository.revokeSession(hashSessionToken(sessionToken));
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
