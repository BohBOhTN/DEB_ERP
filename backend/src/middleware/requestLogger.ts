import type { NextFunction, Request, Response } from "express";
import { getCorrelationId } from "../shared/correlation.js";
import { setLogger, type Logger } from "../shared/logger.js";

/// One line per request, written when the response finishes so the status,
/// duration, and the actor resolved by the authentication guard are all known.
/// The route template (`/api/customers/:customerId`) is logged rather than the
/// raw URL so identifiers never end up in the log and lines aggregate by
/// endpoint.
export function requestLogger(logger: Logger) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const startedAt = process.hrtime.bigint();
    const requestLog = logger.child({
      correlationId: getCorrelationId(response),
    });

    setLogger(response, requestLog);

    response.on("finish", () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const actor = response.locals.currentUser as { id?: string } | undefined;
      const level = response.statusCode >= 500 ? "error" : "info";

      requestLog[level](
        {
          method: request.method,
          route: routeTemplate(request),
          status: response.statusCode,
          durationMs: Math.round(durationMs * 10) / 10,
          actorUserId: actor?.id,
        },
        "request completed",
      );
    });

    next();
  };
}

function routeTemplate(request: Request): string {
  const matched = request.route as { path?: string } | undefined;

  if (matched?.path) {
    return `${request.baseUrl}${matched.path}`;
  }

  // Unmatched (404) requests have no route; keep only the path, never the
  // query string.
  return request.originalUrl.split("?")[0] ?? request.originalUrl;
}
