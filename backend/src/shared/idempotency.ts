import { Prisma, type PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { AppError } from "./appError.js";
import { messages } from "./messages.js";

/// Options every interactive posting transaction runs with. Prisma's defaults
/// (2 s to acquire, 5 s to finish) are too short for a settlement that writes a
/// dozen rows under a row lock on a busy till, and a silent timeout surfaces
/// as an unexplained 500.
export const postingTransactionOptions = {
  maxWait: 5_000,
  timeout: 15_000,
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
} as const;

export interface IdempotencyHooks {
  /// Runs inside the transaction right after the record is inserted. Exists so
  /// a test can inject a failure between steps; production passes nothing.
  afterRecordCreated?: () => Promise<void> | void;
  afterResponseSaved?: () => Promise<void> | void;
}

export interface IdempotentCommandOptions<TResponse> {
  prisma: PrismaClient;
  /// Namespaces the key so the same client key can be reused across commands
  /// (`pos.sale`, `customer.payment`, ...).
  scope: string;
  key: string;
  /// The semantic request. Two calls with the same key but a different payload
  /// are a client bug and are rejected rather than replayed.
  payload: unknown;
  execute: (tx: Prisma.TransactionClient) => Promise<TResponse>;
  hooks?: IdempotencyHooks;
}

const replayedMarker = Symbol.for("dar-el-barka.idempotency.replayed");

/// Runs a posting command exactly once per (scope, key).
///
/// The record is inserted inside the same transaction as the business effects,
/// so a rollback leaves no trace and a commit always stores the response. Two
/// identical requests arriving together both try to insert: PostgreSQL blocks
/// the second on the unique index until the first commits, then rejects it
/// with a unique violation, and the second request replays the stored
/// response. Before this helper existed that violation escaped as a 500.
export async function runIdempotentCommand<TResponse>(
  options: IdempotentCommandOptions<TResponse>,
): Promise<TResponse> {
  const key = options.key.trim();

  if (!key) {
    throw new AppError({
      statusCode: 400,
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: messages.IDEMPOTENCY_KEY_REQUIRED,
    });
  }

  const requestHash = hashPayload(options.payload);
  const where = { scope_key: { scope: options.scope, key } };

  // Cheap fast path: a retry of an already committed command never opens a
  // transaction.
  const existing = await options.prisma.idempotencyRecord.findUnique({ where });
  if (existing) {
    return replayOrConflict<TResponse>(existing, requestHash);
  }

  try {
    return await options.prisma.$transaction(async (tx) => {
      await tx.idempotencyRecord.create({
        data: { scope: options.scope, key, requestHash },
      });
      await options.hooks?.afterRecordCreated?.();

      const response = await options.execute(tx);

      await tx.idempotencyRecord.update({
        where,
        data: { response: toJsonValue(response) },
      });
      await options.hooks?.afterResponseSaved?.();

      return response;
    }, postingTransactionOptions);
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
  }

  // Lost the race: the concurrent request committed first. Its record now
  // holds the response to replay.
  const winner = await options.prisma.idempotencyRecord.findUnique({ where });
  if (!winner) {
    // The winner rolled back after we collided with it. Nothing was committed
    // under this key; the client can safely retry.
    throw new AppError({
      statusCode: 409,
      code: "IDEMPOTENCY_IN_PROGRESS",
      message: messages.IDEMPOTENCY_IN_PROGRESS,
    });
  }

  return replayOrConflict<TResponse>(winner, requestHash);
}

/// True when the value is a response that was replayed from the idempotency
/// store rather than produced by this request. Route handlers use it to add
/// the `Idempotency-Replayed` header.
export function isReplayedResult(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[replayedMarker] === true
  );
}

function replayOrConflict<TResponse>(
  record: { requestHash: string; response: Prisma.JsonValue | null },
  requestHash: string,
): TResponse {
  if (record.requestHash !== requestHash) {
    throw new AppError({
      statusCode: 409,
      code: "IDEMPOTENCY_CONFLICT",
      message: messages.IDEMPOTENCY_CONFLICT,
    });
  }

  if (record.response === null || record.response === undefined) {
    throw new AppError({
      statusCode: 409,
      code: "IDEMPOTENCY_IN_PROGRESS",
      message: messages.IDEMPOTENCY_IN_PROGRESS,
    });
  }

  return markReplayed(record.response) as TResponse;
}

function markReplayed(value: Prisma.JsonValue): Prisma.JsonValue {
  if (typeof value === "object" && value !== null) {
    Object.defineProperty(value, replayedMarker, {
      value: true,
      enumerable: false,
    });
  }

  return value;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export function hashPayload(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

/// Key order must not change the hash: two requests built from the same form
/// are the same request even if a serializer ordered their fields differently.
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (typeof value === "object") {
    const withToJson = value as { toJSON?: () => unknown };
    if (typeof withToJson.toJSON === "function") {
      // Prisma.Decimal and similar value objects serialize through toJSON.
      return stableStringify(withToJson.toJSON());
    }

    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
