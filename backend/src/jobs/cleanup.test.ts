import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../shared/logger.js";
import { runCleanup, scheduleCleanup } from "./cleanup.js";

function makePrisma(locked: boolean) {
  const calls: Array<{ model: string; where: unknown }> = [];
  const tx = {
    $queryRaw: async () => [{ locked }],
    idempotencyRecord: {
      deleteMany: async (args: { where: unknown }) => {
        calls.push({ model: "idempotencyRecord", where: args.where });
        return { count: 3 };
      },
    },
    authSession: {
      deleteMany: async (args: { where: unknown }) => {
        calls.push({ model: "authSession", where: args.where });
        return { count: 2 };
      },
    },
  };
  const prisma = {
    $transaction: async <T>(action: (client: typeof tx) => Promise<T>) =>
      action(tx),
  };

  return { prisma: prisma as unknown as PrismaClient, calls };
}

const logger = createLogger({ level: "silent" });
const now = () => new Date("2026-09-22T12:00:00.000Z");

describe("runCleanup", () => {
  it("deletes idempotency records past the TTL and long-expired sessions", async () => {
    const { prisma, calls } = makePrisma(true);

    const result = await runCleanup({
      prisma,
      logger,
      idempotencyTtlDays: 7,
      now,
    });

    expect(result).toEqual({
      skipped: false,
      idempotencyRecordsDeleted: 3,
      sessionsDeleted: 2,
    });
    expect(calls).toEqual([
      {
        model: "idempotencyRecord",
        where: { createdAt: { lt: new Date("2026-09-15T12:00:00.000Z") } },
      },
      {
        model: "authSession",
        where: { expiresAt: { lt: new Date("2026-09-21T12:00:00.000Z") } },
      },
    ]);
  });

  it("does nothing when another instance holds the advisory lock", async () => {
    const { prisma, calls } = makePrisma(false);

    const result = await runCleanup({
      prisma,
      logger,
      idempotencyTtlDays: 7,
      now,
    });

    expect(result.skipped).toBe(true);
    expect(calls).toEqual([]);
  });
});

describe("scheduleCleanup", () => {
  it("runs immediately, then on the interval, until stopped", async () => {
    vi.useFakeTimers();
    try {
      const { prisma, calls } = makePrisma(true);
      const stop = scheduleCleanup(
        { prisma, logger, idempotencyTtlDays: 7, now },
        1_000,
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toHaveLength(2);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(calls).toHaveLength(4);

      stop();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(calls).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });
});
