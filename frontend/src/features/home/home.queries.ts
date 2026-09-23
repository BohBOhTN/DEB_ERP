import { useQuery } from "@tanstack/react-query";
import { fetchHomeSummary } from "./home.api.js";

export const homeKeys = {
  all: ["home"] as const,
  summary: (date: string | undefined) =>
    ["home", "summary", date ?? "today"] as const,
};

/// Refetches every 60 s while the tab is visible (07 section 3.1).
export function useHomeSummary(date: string | undefined) {
  return useQuery({
    queryKey: homeKeys.summary(date),
    queryFn: () => fetchHomeSummary(date),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
