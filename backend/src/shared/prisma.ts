import { PrismaClient } from "@prisma/client";
import type { Logger } from "./logger.js";

export interface CreatePrismaClientParams {
  logger: Logger;
  /// Queries slower than this are logged at `warn` with their duration so a
  /// regression shows up in the logs before users notice it. The SQL text is
  /// logged, never the bound parameters.
  slowQueryMs: number;
}

/// Pool size and acquisition timeout are part of the connection string
/// (`connection_limit`, `pool_timeout`); see `.env.example`. This factory adds
/// the slow-query log and the error and warning channels.
export function createPrismaClient(params: CreatePrismaClientParams) {
  const client = new PrismaClient({
    log: [
      { level: "query", emit: "event" },
      { level: "error", emit: "event" },
      { level: "warn", emit: "event" },
    ],
  });

  client.$on("query", (event) => {
    if (event.duration >= params.slowQueryMs) {
      params.logger.warn(
        {
          durationMs: event.duration,
          query: event.query,
          target: event.target,
        },
        "slow query",
      );
    }
  });
  client.$on("error", (event) => {
    params.logger.error({ target: event.target }, event.message);
  });
  client.$on("warn", (event) => {
    params.logger.warn({ target: event.target }, event.message);
  });

  return client;
}
