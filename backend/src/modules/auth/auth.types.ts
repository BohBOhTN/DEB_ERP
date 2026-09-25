export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  effectivePermissions: string[];
  /// Display names of the active roles, for the shell's user menu.
  roles: Array<{ id: string; name: string }>;
  /// When the session ends (fixed TTL), so the client can warn before.
  sessionExpiresAt: string | null;
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
  /// Optional so test doubles need not implement it; without it the user
  /// has no role names.
  findUserRoles?(userId: string): Promise<Array<{ id: string; name: string }>>;
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
