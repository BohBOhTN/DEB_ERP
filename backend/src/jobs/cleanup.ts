import type { PrismaClient } from "@prisma/client";
import type { Logger } from "../shared/logger.js";

/// Arbitrary but fixed: every API instance asks PostgreSQL for the same lock,
/// so when several instances run the job at once only one does the work.
const cleanupLockKey = 72_610_001;
const dayMs = 24 * 60 * 60 * 1000;

export interface CleanupDependencies {
  prisma: PrismaClient;
  logger: Logger;
  /// Idempotency records older than this are unreachable in practice: a
  /// client retries within seconds, not days.
  idempotencyTtlDays: number;
  /// Expired sessions are kept briefly so a "session expired" audit trail can
  /// still be joined, then dropped.
  sessionGraceDays?: number;
  now?: () => Date;
}

export interface CleanupResult {
  skipped: boolean;
  idempotencyRecordsDeleted: number;
  sessionsDeleted: number;
}

/// Deletes idempotency records past their TTL and long-expired sessions. Both
/// tables otherwise grow by one row per command or login forever.
export async function runCleanup(
  deps: CleanupDependencies,
): Promise<CleanupResult> {
  const now = deps.now?.() ?? new Date();
  const idempotencyCutoff = new Date(
    now.getTime() - deps.idempotencyTtlDays * dayMs,
  );
  const sessionCutoff = new Date(
    now.getTime() - (deps.sessionGraceDays ?? 1) * dayMs,
  );

  const result = await deps.prisma.$transaction(async (tx) => {
    const [{ locked }] = await tx.$queryRaw<
      Array<{ locked: boolean }>
    >`SELECT pg_try_advisory_xact_lock(${cleanupLockKey}) AS locked`;

    if (!locked) {
      return null;
    }

    const idempotency = await tx.idempotencyRecord.deleteMany({
      where: { createdAt: { lt: idempotencyCutoff } },
    });
    const sessions = await tx.authSession.deleteMany({
      where: { expiresAt: { lt: sessionCutoff } },
    });

    return {
      idempotencyRecordsDeleted: idempotency.count,
      sessionsDeleted: sessions.count,
    };
  });

  if (!result) {
    deps.logger.debug("cleanup skipped; another instance holds the lock");
    return { skipped: true, idempotencyRecordsDeleted: 0, sessionsDeleted: 0 };
  }

  deps.logger.info(result, "cleanup completed");
  return { skipped: false, ...result };
}

/// Runs the cleanup once now and then on an interval. The timer is unref'd so
/// it never keeps a shutting-down process alive; the returned function stops
/// it explicitly.
export function scheduleCleanup(
  deps: CleanupDependencies,
  intervalMs: number,
): () => void {
  const run = () => {
    runCleanup(deps).catch((error: unknown) => {
      deps.logger.error({ err: error }, "cleanup failed");
    });
  };

  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();

  return () => {
    clearInterval(timer);
  };
}
