export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  effectivePermissions: string[];
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string>;
    correlationId: string;
  };
}

interface ApiEnvelope<TData> {
  data: TData;
  meta: {
    correlationId: string;
  };
}

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export async function getCurrentUser(): Promise<CurrentUser> {
  const response = await fetch(`${apiBaseUrl}/auth/me`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<{ user: CurrentUser }>;
  return body.data.user;
}

export async function login(params: {
  email: string;
  password: string;
}): Promise<CurrentUser> {
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<{ user: CurrentUser }>;
  return body.data.user;
}

export async function logout(): Promise<void> {
  await fetch(`${apiBaseUrl}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

async function readApiError(response: Response): Promise<ApiError> {
  try {
    return (await response.json()) as ApiError;
  } catch {
    return {
      error: {
        code: "RETRYABLE_SERVER_ERROR",
        message: "Une erreur est survenue. Veuillez reessayer.",
        correlationId: "",
      },
    };
  }
}
