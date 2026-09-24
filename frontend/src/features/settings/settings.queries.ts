import { useQuery } from "@tanstack/react-query";
import { tier } from "../../lib/query/cachePolicy.js";
import { getHealthReady } from "./settings.api.js";

export const settingsKeys = {
  health: ["settings", "health"] as const,
};

/// The build identity does not change during a session (UI-21).
export function useHealthReady() {
  return useQuery({
    queryKey: settingsKeys.health,
    queryFn: getHealthReady,
    ...tier("reference"),
  });
}
