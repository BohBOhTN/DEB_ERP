import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const headerName = "x-correlation-id";

export function correlationId(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const incoming = request.header(headerName);
  const id = incoming && incoming.trim().length > 0 ? incoming : randomUUID();

  response.locals.correlationId = id;
  response.setHeader(headerName, id);
  next();
}

export function getCorrelationId(response: Response): string {
  return String(response.locals.correlationId);
}
