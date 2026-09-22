import type { NextFunction, Request, Response } from "express";

/// The API contract version a request was made against. Handlers do not
/// branch on it; the response helpers in `apiResponse.ts` shape the envelope
/// from it, so one handler serves both prefixes.
export type ApiVersion = 0 | 1;

export function markApiVersion(version: ApiVersion) {
  return (_request: Request, response: Response, next: NextFunction): void => {
    response.locals.apiVersion = version;
    next();
  };
}

/// Legacy `/api` responses announce their deprecation (RFC 9745) so a client
/// still on the old prefix can be found in the logs and in devtools.
export function markDeprecated(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  response.locals.apiVersion = 0;
  response.setHeader("Deprecation", "true");
  next();
}

export function getApiVersion(response: Response): ApiVersion {
  return response.locals.apiVersion === 1 ? 1 : 0;
}
