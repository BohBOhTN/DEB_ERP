import type { z } from "zod";

/// BE-34: one declarative record per `/api/v1` route. The document builder in
/// `document.ts` turns these into OpenAPI operations, and `openapi.test.ts`
/// proves the catalogue covers every mounted route, so a route added without
/// its record fails the build rather than silently missing from the contract.

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export interface ApiOperation {
  method: HttpMethod;
  /// Path under `/api/v1`, with `{param}` placeholders.
  path: string;
  operationId: string;
  summary: string;
  tag: string;
  /// Any one of these permission keys allows the call. Absent on the public
  /// health and login routes; an empty list means "session only".
  permissions?: string[];
  /// Public routes need no session.
  public?: boolean;
  query?: z.ZodType;
  body?: z.ZodType;
  /// Commands that take an `Idempotency-Key` header and may replay.
  idempotent?: boolean;
  /// Successful status when it is not 200.
  status?: 200 | 201 | 204;
  /// A paginated collection: `data` is `{ items, page, pageSize, total,
  /// pageCount }` on `/api/v1`.
  list?: boolean;
  /// The named key the payload is wrapped under (`data: { customer }`).
  dataKey?: string;
  /// Cursor-paged statements carry `meta.opening/closing` on top of the
  /// request correlation id.
  statement?: boolean;
}

export function operation(record: ApiOperation): ApiOperation {
  return record;
}

/// Express `:param` to OpenAPI `{param}`; used by the test that extracts the
/// mounted routes from the route files.
export function toOpenApiPath(expressPath: string): string {
  return expressPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}
