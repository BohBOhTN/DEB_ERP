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
    if (
      hasAny(permissions, [
        "products.view",
        "raw_materials.view",
        "simulations.view",
        "purchases.view",
      ])
    ) {
      void import("../features/catalog/catalog.queries.js").then((m) =>
        m.prefetchCatalogReference(queryClient),
      );
    }
  }, [permissions, queryClient]);
}
