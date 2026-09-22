import { HttpResponse } from "msw";

/// The backend envelopes, so handlers stay one line each.
export function ok<T>(data: T, status = 200) {
  return HttpResponse.json(
    { data, meta: { correlationId: "test-correlation" } },
    { status },
  );
}

export function apiError(
  status: number,
  code: string,
  message: string,
  fieldErrors?: Record<string, string>,
) {
  return HttpResponse.json(
    {
      error: { code, message, fieldErrors, correlationId: "test-correlation" },
    },
    { status },
  );
}

export const apiV1 = "*/api/v1";
