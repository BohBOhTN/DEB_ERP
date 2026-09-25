import { Prisma, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  hashPayload,
  isReplayedResult,
  runIdempotentCommand,
  stableStringify,
} from "./idempotency.js";

interface StoredRecord {
  scope: string;
  key: string;
  requestHash: string;
  response: Prisma.JsonValue | null;
}

/// Minimal in-memory stand-in: enough of the client for the helper's own
/// control flow. Unique-violation behaviour under real concurrency is proven
/// by the PostgreSQL suite next to this file.
function makePrisma(options: { failCreate?: boolean } = {}) {
  const records: StoredRecord[] = [];
  const find = (where: { scope_key: { scope: string; key: string } }) =>
    records.find(
      (record) =>
        record.scope === where.scope_key.scope &&
        record.key === where.scope_key.key,
    ) ?? null;

  const tx = {
    idempotencyRecord: {
      create: async ({ data }: { data: StoredRecord }) => {
        if (options.failCreate || find({ scope_key: data })) {
          throw new Prisma.PrismaClientKnownRequestError("duplicate", {
            code: "P2002",
            clientVersion: "test",
          });
        }
        records.push({ ...data, response: null });
        return data;
      },
      update: async ({
        where,
        data,
      }: {
        where: { scope_key: { scope: string; key: string } };
        data: { response: Prisma.JsonValue };
      }) => {
        const record = find(where);
        if (record) {
          record.response = data.response;
        }
        return record;
      },
    },
  };

  const prisma = {
    idempotencyRecord: {
      findUnique: async ({
        where,
      }: {
        where: { scope_key: { scope: string; key: string } };
      }) => find(where),
    },
    $transaction: async <T>(
      action: (client: typeof tx) => Promise<T>,
      _options?: unknown,
    ) => action(tx),
  };

  return { prisma: prisma as unknown as PrismaClient, records };
}

describe("runIdempotentCommand", () => {
  it("executes once and replays the stored response for the same key and payload", async () => {
    const { prisma, records } = makePrisma();
    let executions = 0;
    const run = () =>
      runIdempotentCommand({
        prisma,
        scope: "test.command",
        key: "key-1",
        payload: { amount: "1.000", note: "a" },
        execute: async () => {
          executions += 1;
          return { id: "doc-1", executions };
        },
      });

    const first = await run();
    const second = await run();

    expect(executions).toBe(1);
    expect(first).toEqual({ id: "doc-1", executions: 1 });
    expect(second).toEqual({ id: "doc-1", executions: 1 });
    expect(isReplayedResult(first)).toBe(false);
    expect(isReplayedResult(second)).toBe(true);
    expect(records).toHaveLength(1);
  });

  it("rejects the same key with a different payload", async () => {
    const { prisma } = makePrisma();
    await runIdempotentCommand({
      prisma,
      scope: "test.command",
      key: "key-2",
      payload: { amount: "1.000" },
      execute: async () => ({ ok: true }),
    });

    await expect(
      runIdempotentCommand({
        prisma,
        scope: "test.command",
        key: "key-2",
        payload: { amount: "2.000" },
        execute: async () => ({ ok: true }),
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: "IDEMPOTENCY_CONFLICT" });
  });

  it("requires a non-blank key", async () => {
    const { prisma } = makePrisma();

    await expect(
      runIdempotentCommand({
        prisma,
        scope: "test.command",
        key: "   ",
        payload: {},
        execute: async () => ({ ok: true }),
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "IDEMPOTENCY_KEY_REQUIRED",
    });
  });

  it("does not treat key order as a different request", () => {
    expect(hashPayload({ a: 1, b: [{ c: 2, d: 3 }] })).toBe(
      hashPayload({ b: [{ d: 3, c: 2 }], a: 1 }),
    );
    expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: 2 }));
  });

  it("serializes decimals and dates by value", () => {
    const date = new Date("2026-09-22T10:00:00.000Z");
    expect(
      stableStringify({ amount: new Prisma.Decimal("12.500"), at: date }),
    ).toBe('{"amount":"12.5","at":"2026-09-22T10:00:00.000Z"}');
    // An undefined field is absent from JSON and must not change the hash.
    expect(hashPayload({ a: 1, b: undefined })).toBe(hashPayload({ a: 1 }));
  });

  it("reports a lost race whose winner left no record as in progress", async () => {
    // The insert collides but nobody committed a record: the concurrent
    // request rolled back. The client is told to retry rather than getting a
    // 500 from the unique violation.
    const { prisma } = makePrisma({ failCreate: true });

    await expect(
      runIdempotentCommand({
        prisma,
        scope: "test.command",
        key: "key-3",
        payload: {},
        execute: async () => ({ ok: true }),
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "IDEMPOTENCY_IN_PROGRESS",
    });
  });

  it("marks a replay without changing what is serialized", async () => {
    const { prisma } = makePrisma();
    await runIdempotentCommand({
      prisma,
      scope: "test.command",
      key: "key-4",
      payload: {},
      execute: async () => ({ id: "doc-4" }),
    });
    const replay = await runIdempotentCommand({
      prisma,
      scope: "test.command",
      key: "key-4",
      payload: {},
      execute: async () => ({ id: "never" }),
    });

    expect(JSON.stringify(replay)).toBe('{"id":"doc-4"}');
    expect(Object.keys(replay)).toEqual(["id"]);
  });
});
