import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { PermissionSet } from "../lib/auth/permissions.js";
import { hasAny } from "../lib/auth/permissions.js";

/// Reads the reference data once, right after the session is known, so the
/// first combobox of the session opens with its options (UI-26). The
/// catalogue module is loaded on demand so the shell bundle stays flat;
/// the queries themselves carry the `reference` tier and are refreshed
/// only by their own mutations.
export function useReferenceWarmup(permissions: PermissionSet | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!permissions) return;
    // Each reference read is gated by its own permission: a cashier without
    // the catalogue must not trigger refused requests at every sign-in.
    const units = hasAny(permissions, ["units.view"]);
    const categories = hasAny(permissions, ["categories.view"]);
    if (units || categories) {
      void import("../features/catalog/catalog.queries.js").then((m) =>
        m.prefetchCatalogReference(queryClient, { units, categories }),
      );
    }
  }, [permissions, queryClient]);
}
