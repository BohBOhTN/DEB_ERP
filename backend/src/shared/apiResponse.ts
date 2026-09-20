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
