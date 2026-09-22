/// Effective permission keys per user, kept in process memory for a short
/// time so the hottest path in the API (authenticating a request) does not
/// join roles and permissions on every call.
///
/// Correctness rule (IAM-012): a permission change must take effect on the
/// next request, so every access mutation invalidates the cache explicitly
/// rather than waiting for the TTL. The TTL only bounds staleness if a
/// mutation ever bypasses the access service.
///
/// The cache is per process. A multi-instance deployment relies on the TTL
/// for changes made through another instance, which the release notes must
/// state until a shared store exists.
export class PermissionCache {
  private readonly entries = new Map<
    string,
    { keys: string[]; expiresAt: number }
  >();

  public constructor(
    private readonly ttlMs: number = 60_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  public get(userId: string): string[] | undefined {
    const entry = this.entries.get(userId);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= this.now()) {
      this.entries.delete(userId);
      return undefined;
    }

    return entry.keys;
  }

  public set(userId: string, keys: string[]): void {
    this.entries.set(userId, {
      keys: [...keys],
      expiresAt: this.now() + this.ttlMs,
    });
  }

  public invalidateUser(userId: string): void {
    this.entries.delete(userId);
  }

  /// Role and permission changes affect an unknown set of users; dropping
  /// everything is cheap and always correct.
  public invalidateAll(): void {
    this.entries.clear();
  }

  public get size(): number {
    return this.entries.size;
  }
}
