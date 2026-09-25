import { useQuery } from "@tanstack/react-query";
import { tier } from "../../lib/query/cachePolicy.js";
import * as api from "./audit.api.js";

export const auditKeys = {
  all: ["audit"] as const,
  list: (query: api.AuditListQuery) => ["audit", "list", query] as const,
  filters: ["audit", "filters"] as const,
};

export function useAuditEvents(query: api.AuditListQuery) {
  return useQuery({
    queryKey: auditKeys.list(query),
    queryFn: () => api.listAuditEvents(query),
    placeholderData: (previous) => previous,
    ...tier("list"),
  });
}

export function useAuditFilters() {
  return useQuery({
    queryKey: auditKeys.filters,
    queryFn: api.getAuditFilters,
    ...tier("reference"),
  });
}
