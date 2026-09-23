import { useQuery } from "@tanstack/react-query";
import * as api from "./pos.api.js";

export const posKeys = {
  all: ["pos"] as const,
  session: ["pos", "session"] as const,
};

/// Whether a till is open decides if an advance or a payment can be taken
/// in cash right now (07 sections 4.4 and 4.5).
export function useCurrentSession(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: posKeys.session,
    queryFn: api.getCurrentSession,
    enabled: options.enabled ?? true,
    staleTime: 30_000,
  });
}
