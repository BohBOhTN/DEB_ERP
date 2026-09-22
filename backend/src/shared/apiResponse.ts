import type { Response } from "express";
import { getApiVersion } from "./apiVersion.js";
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

export interface ApiPage<TItem> {
  items: TItem[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
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

/// Builds the envelope for the contract version the request was made against.
///
/// Legacy `/api`: a list is wrapped under its resource key, as the V1 screens
/// expect (`data: { customers: { items, page, ... } }`).
/// `/api/v1`: a list is the data itself (`data: { items, page, ... }`), the one
/// shape the new frontend's table component consumes (ADR-V2-004). Single
/// resources and command results keep their named key on both.
export function okFor<TData>(
  response: Response,
  data: TData,
): ApiResponse<unknown> {
  const correlationId = getCorrelationId(response);

  if (getApiVersion(response) === 1) {
    const page = singlePage(data);
    if (page) {
      return ok(page, correlationId);
    }
  }

  return ok(data, correlationId);
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

  response.status(statusCode).json(okFor(response, result));
}

function singlePage(data: unknown): ApiPage<unknown> | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length !== 1) {
    return null;
  }

  const value = entries[0][1];
  return isPage(value) ? value : null;
}

function isPage(value: unknown): value is ApiPage<unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ApiPage<unknown>>;
  return (
    Array.isArray(candidate.items) &&
    typeof candidate.page === "number" &&
    typeof candidate.pageSize === "number" &&
    typeof candidate.total === "number" &&
    typeof candidate.pageCount === "number"
  );
}
