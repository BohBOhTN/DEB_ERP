import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiClient } from "../api/client.js";
import { ApiError } from "../api/errors.js";
import { toPermissionSet, type PermissionSet } from "./permissions.js";

/// The signed-in user as `GET /api/v1/auth/me` returns it (06 section 3.1).
export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  effectivePermissions: string[];
  roles: Array<{ id: string; name: string }>;
  /// Fixed 8 h session (OD-V2-005); the shell warns 10 minutes before.
  sessionExpiresAt: string | null;
}

export const sessionQueryKey = ["auth", "me"] as const;
export const sessionStaleTimeMs = 5 * 60_000;

export interface SessionState {
  status: "loading" | "anonymous" | "authenticated" | "error";
  user: SessionUser | null;
  permissions: PermissionSet;
  error: unknown;
  refetch: () => void;
}

const emptyPermissions = toPermissionSet([]);

/// Runs once per 5 minutes; a 401 is the anonymous state, not an error.
export function useSession(): SessionState {
  const query = useQuery({
    queryKey: sessionQueryKey,
    queryFn: fetchSession,
    staleTime: sessionStaleTimeMs,
    retry: false,
  });

  const user = query.data ?? null;
  const status = query.isPending
    ? "loading"
    : user
      ? "authenticated"
      : query.error instanceof ApiError && !query.error.isUnauthenticated
        ? "error"
        : "anonymous";

  return {
    status,
    user,
    permissions: user
      ? toPermissionSet(user.effectivePermissions)
      : emptyPermissions,
    error: status === "error" ? query.error : null,
    refetch: () => void query.refetch(),
  };
}

export async function fetchSession(): Promise<SessionUser | null> {
  try {
    const data = await apiClient.get<{ user: SessionUser }>("/auth/me");

    return data.user;
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthenticated) {
      return null;
    }

    throw error;
  }
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const data = await apiClient.post<{
        user: SessionUser;
        expiresAt?: string;
      }>("/auth/login", input);

      return {
        ...data.user,
        sessionExpiresAt: data.expiresAt ?? data.user.sessionExpiresAt ?? null,
      };
    },
    onSuccess: (user) => {
      queryClient.setQueryData(sessionQueryKey, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await apiClient.post("/auth/logout");
    },
    onSettled: () => {
      queryClient.setQueryData(sessionQueryKey, null);
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== "auth",
      });
    },
  });
}

/// Forgets the cached session so the router redirects to `/connexion`; used
/// by the API client's 401 hook.
export function useClearSessionOnUnauthorized(
  subscribe: (listener: () => void) => () => void,
) {
  const queryClient = useQueryClient();

  useEffect(
    () =>
      subscribe(() => {
        queryClient.setQueryData(sessionQueryKey, null);
      }),
    [queryClient, subscribe],
  );
}

/// Milliseconds until the warning toast is due, or null when unknown or past.
export function expiryWarningDelayMs(
  sessionExpiresAt: string | null,
  now = Date.now(),
  leadMs = 10 * 60_000,
): number | null {
  if (!sessionExpiresAt) {
    return null;
  }

  const expiresAt = new Date(sessionExpiresAt).getTime();

  if (Number.isNaN(expiresAt)) {
    return null;
  }

  const delay = expiresAt - leadMs - now;

  return delay > 0 ? delay : null;
}
