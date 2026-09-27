import { ApiError, apiErrorFromBody } from "./errors.js";
import { randomId } from "../ids.js";
import type { PageResult } from "./pagination.js";

/// The fetch wrapper every feature API file uses (06 section 3.2). It talks
/// to `/api/v1` only, sends the session cookie, a correlation id and the
/// French language header, unwraps the `{ data, meta }` envelope, and turns
/// every failure into an `ApiError`.
export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface ApiMeta {
  correlationId: string;
}

type UnauthorizedListener = (error: ApiError) => void;

const unauthorizedListeners = new Set<UnauthorizedListener>();

/// The session layer (Sprint 19) subscribes here to clear the session and
/// redirect to `/connexion` on any 401.
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

export function resolveApiBaseUrl(
  env: Record<string, unknown> = import.meta.env,
): string {
  const explicit = env.VITE_API_V1_BASE_URL;
  if (typeof explicit === "string" && explicit.length > 0) {
    return trimSlash(explicit);
  }

  const legacy = env.VITE_API_BASE_URL;
  if (typeof legacy === "string" && legacy.length > 0) {
    return `${trimSlash(legacy)}/v1`;
  }

  return "/api/v1";
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export class ApiClient {
  public constructor(
    private readonly baseUrl: string = resolveApiBaseUrl(),
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
  ) {}

  public get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("GET", path, undefined, options);
  }

  /// A list endpoint on `/api/v1` answers with the page as `data`.
  public list<T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<PageResult<T>> {
    return this.request<PageResult<T>>("GET", path, undefined, options);
  }

  public post<T>(
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    return this.request<T>("POST", path, body, options);
  }

  public patch<T>(
    path: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    return this.request<T>("PATCH", path, body, options);
  }

  public put<T>(
    path: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    return this.request<T>("PUT", path, body, options);
  }

  public delete<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>("DELETE", path, undefined, options);
  }

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    options: RequestOptions,
  ): Promise<T> {
    const url = this.buildUrl(path, options.query);
    const correlationId = randomId();
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Accept-Language": "fr",
      "X-Correlation-Id": correlationId,
    };

    // A FormData body sets its own multipart boundary; anything else is JSON.
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    if (body !== undefined && !isForm) {
      headers["Content-Type"] = "application/json";
    }

    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    const init: RequestInit = {
      method,
      headers,
      credentials: "include",
      body:
        body === undefined
          ? undefined
          : isForm
            ? (body as FormData)
            : JSON.stringify(body),
      // Only set when given: an undefined key is enough for Node's fetch to
      // run its realm check against jsdom's AbortSignal in tests.
      ...(options.signal ? { signal: options.signal } : {}),
    };

    // Only an idempotent read is retried, once, and only on a network
    // failure: a command must never be replayed by the client without its key.
    const attempts = method === "GET" ? 2 : 1;
    let response: Response | undefined;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        response = await this.fetchImpl(url, init);
        break;
      } catch (error) {
        if (options.signal?.aborted || attempt === attempts) {
          throw new ApiError({
            code: "NETWORK_ERROR",
            message: error instanceof Error ? error.message : "",
            status: 0,
            correlationId,
          });
        }
      }
    }

    if (!response) {
      throw new ApiError({
        code: "NETWORK_ERROR",
        message: "",
        status: 0,
        correlationId,
      });
    }

    const payload = await readJson(response);

    if (!response.ok) {
      const error = apiErrorFromBody(response.status, payload, correlationId);

      if (error.isUnauthenticated) {
        unauthorizedListeners.forEach((listener) => listener(error));
      }

      throw error;
    }

    const envelope = payload as { data?: T } | null;

    return (envelope && "data" in envelope ? envelope.data : payload) as T;
  }

  private buildUrl(path: string, query: RequestOptions["query"]): string {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

    if (!query) {
      return url;
    }

    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") {
        params.set(key, String(value));
      }
    }

    const search = params.toString();

    return search ? `${url}?${search}` : url;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export const apiClient = new ApiClient();
