/// The one error type the API client throws (06 section 3.2). It mirrors the
/// backend envelope `{ error: { code, message, fieldErrors, correlationId } }`
/// and adds the HTTP status; a network failure is an `ApiError` too, so
/// callers never branch on a raw `Response` or `TypeError`.
export interface ApiErrorBody {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
  correlationId?: string;
}

export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly fieldErrors: Record<string, string>;
  public readonly correlationId: string | null;

  public constructor(params: {
    code: string;
    message: string;
    status: number;
    fieldErrors?: Record<string, string>;
    correlationId?: string | null;
  }) {
    super(params.message);
    this.name = "ApiError";
    this.code = params.code;
    this.status = params.status;
    this.fieldErrors = params.fieldErrors ?? {};
    this.correlationId = params.correlationId ?? null;
  }

  public get isValidation(): boolean {
    return this.code === "VALIDATION_ERROR";
  }

  public get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  public get isForbidden(): boolean {
    return this.status === 403;
  }

  public get isVersionConflict(): boolean {
    return this.code === "VERSION_CONFLICT";
  }

  public get isNetwork(): boolean {
    return this.code === "NETWORK_ERROR";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/// Reads the backend error envelope from a failed response body; anything
/// that is not the contract becomes a generic error with the status code.
export function apiErrorFromBody(
  status: number,
  body: unknown,
  correlationId: string | null,
): ApiError {
  const candidate = (body as { error?: Partial<ApiErrorBody> } | null)?.error;

  if (candidate && typeof candidate.code === "string") {
    return new ApiError({
      code: candidate.code,
      message: typeof candidate.message === "string" ? candidate.message : "",
      status,
      fieldErrors: candidate.fieldErrors,
      correlationId: candidate.correlationId ?? correlationId,
    });
  }

  return new ApiError({
    code: status === 429 ? "RATE_LIMITED" : `HTTP_${status}`,
    message: "",
    status,
    correlationId,
  });
}
