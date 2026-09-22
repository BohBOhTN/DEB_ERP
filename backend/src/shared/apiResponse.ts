import type { Response } from "express";
import { getCorrelationId } from "./correlation.js";
import { isReplayedResult } from "./idempotency.js";

export interface ApiMeta {
  correlationId: string;
}

export interface ApiResponse<TData> {
  data: TData;
  meta: ApiMeta;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string>;
    correlationId: string;
  };
}

export function ok<TData>(
  data: TData,
  correlationId: string,
): ApiResponse<TData> {
  return {
    data,
    meta: {
      correlationId,
    },
  };
}

/// Sends the result of an idempotent posting command. A replayed result gets
/// the same status and body as the original so a retrying client cannot tell
/// the difference by accident, plus a header so a client that wants to know
/// can.
export function sendCommandResult<TData>(
  response: Response,
  statusCode: number,
  result: TData,
): void {
  if (isReplayedResult(result)) {
    response.setHeader("Idempotency-Replayed", "true");
  }

  response.status(statusCode).json(ok(result, getCorrelationId(response)));
}
