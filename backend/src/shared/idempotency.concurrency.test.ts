import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isReplayedResult, runIdempotentCommand } from "./idempotency.js";

/// AS-V2-02: identical concurrent submissions with one key produce one effect
/// and replay for everyone else, never a 500. Only PostgreSQL can prove it,
/// because the guarantee rests on the unique index blocking the second insert
/// until the first transaction commits.
///
/// Point INTEGRATION_DATABASE_URL at a throwaway database. Never the shared
/// remote development database: this suite writes and deletes rows.
const integrationDatabaseUrl = process.env.INTEGRATION_DATABASE_URL;

if (process.env.REQUIRE_INTEGRATION_TESTS && !integrationDatabaseUrl) {
  throw new Error(
    "REQUIRE_INTEGRATION_TESTS is set but INTEGRATION_DATABASE_URL is missing.",
  );
}

const runId = Math.random().toString(36).slice(2, 10);
const scope = `integration.idempotency.${runId}`;
const concurrentAttempts = 10;
const suite = integrationDatabaseUrl ? describe : describe.skip;

suite("runIdempotentCommand under concurrency", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: withConnectionLimit(integrationDatabaseUrl as string),
        },
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.auditEvent.deleteMany({
        where: { entity: scope },
      });
      await prisma.idempotencyRecord.deleteMany({
        where: { scope },
      });
      await prisma.$disconnect();
    }
  });

  it("commits one effect and replays the rest for one key", async () => {
    const key = `duplicate-${runId}`;
    const payload = { amountTnd: "12.500", note: "double tap" };

    // Built in one synchronous pass so the transactions really overlap.
    const results = await Promise.allSettled(
      Array.from({ length: concurrentAttempts }, () =>
        runIdempotentCommand({
          prisma,
          scope,
          key,
          payload,
          execute: async (tx) => {
            const event = await tx.auditEvent.create({
              data: {
                action: "integration.effect",
                entity: scope,
                targetId: key,
              },
            });

            return { effectId: event.id };
          },
        }),
      ),
    );

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<{ effectId: string }> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter((result) => result.status === "rejected");

    // No attempt may fail: the losers replay, they do not error.
    expect(rejected).toEqual([]);
    expect(fulfilled).toHaveLength(concurrentAttempts);

    const effectIds = new Set(fulfilled.map((result) => result.value.effectId));
    expect(effectIds.size).toBe(1);

    const replayed = fulfilled.filter((result) =>
      isReplayedResult(result.value),
    );
    expect(replayed).toHaveLength(concurrentAttempts - 1);

    const effects = await prisma.auditEvent.count({
      where: { entity: scope, targetId: key },
    });
    expect(effects).toBe(1);

    const record = await prisma.idempotencyRecord.findUniqueOrThrow({
      where: { scope_key: { scope, key } },
    });
    expect(record.response).toEqual({ effectId: [...effectIds][0] });
  }, 60_000);

  it("rejects a concurrent reuse of the key with a different payload", async () => {
    const key = `conflict-${runId}`;
    const run = (note: string) =>
      runIdempotentCommand({
        prisma,
        scope,
        key,
        payload: { note },
        execute: async (tx) => {
          const event = await tx.auditEvent.create({
            data: {
              action: "integration.effect",
              entity: scope,
              targetId: key,
            },
          });
          return { effectId: event.id };
        },
      });

    const results = await Promise.allSettled([run("first"), run("second")]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      statusCode: 409,
      code: "IDEMPOTENCY_CONFLICT",
    });

    const effects = await prisma.auditEvent.count({
      where: { entity: scope, targetId: key },
    });
    expect(effects).toBe(1);
  }, 60_000);

  it("leaves no record behind when the command fails", async () => {
    const key = `failure-${runId}`;

    await expect(
      runIdempotentCommand({
        prisma,
        scope,
        key,
        payload: {},
        execute: async () => {
          throw new Error("business rule violated");
        },
      }),
    ).rejects.toThrow("business rule violated");

    const record = await prisma.idempotencyRecord.findUnique({
      where: { scope_key: { scope, key } },
    });
    expect(record).toBeNull();
  }, 60_000);
});

/// Enough pooled connections for every concurrent attempt to hold its own
/// transaction at the same time; otherwise they queue and never race.
function withConnectionLimit(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("connection_limit", String(concurrentAttempts + 2));
  return parsed.toString();
}
