export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  effectivePermissions: string[];
}

export interface StoredUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  isActive: boolean;
}

export interface StoredSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  /// When the session last authenticated a request. Optional so in-memory
  /// repositories in tests need not track it.
  lastUsedAt?: Date | null;
  user: StoredUser;
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<StoredUser | null>;
  findEffectivePermissionKeys(userId: string): Promise<string[]>;
  createSession(params: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<StoredSession | null>;
  touchSession(sessionId: string): Promise<void>;
  revokeSession(tokenHash: string): Promise<void>;
  createUser(params: {
    email: string;
    displayName: string;
    passwordHash: string;
  }): Promise<StoredUser>;
}
