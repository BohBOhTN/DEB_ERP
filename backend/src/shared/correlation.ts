import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const headerName = "x-correlation-id";

/// A client may propagate its own id so a browser error and the server log line
/// share one identifier, but the value is persisted in audit rows and ledger
/// entries, so it must be short and printable. Anything else is replaced.
const acceptedPattern = /^[A-Za-z0-9_.-]{8,64}$/;

export function isAcceptableCorrelationId(value: string): boolean {
  return acceptedPattern.test(value);
}

export function correlationId(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const incoming = request.header(headerName)?.trim() ?? "";
  const id = isAcceptableCorrelationId(incoming) ? incoming : randomUUID();

  response.locals.correlationId = id;
  response.setHeader(headerName, id);
  next();
}

export function getCorrelationId(response: Response): string {
  return String(response.locals.correlationId);
}
