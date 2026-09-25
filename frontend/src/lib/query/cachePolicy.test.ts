import { describe, expect, it } from "vitest";
import { cacheTiers, tier } from "./cachePolicy";

describe("cache policy", () => {
  it("keeps reference data for the session and never refetches it on focus", () => {
    expect(tier("reference")).toEqual({
      staleTime: 30 * 60_000,
      gcTime: 24 * 60 * 60_000,
      refetchOnWindowFocus: false,
    });
  });

  it("orders the tiers from the most static to the most live", () => {
    expect(cacheTiers.reference.staleTime).toBeGreaterThan(
      cacheTiers.document.staleTime,
    );
    expect(cacheTiers.document.staleTime).toBeGreaterThan(
      cacheTiers.list.staleTime,
    );
    expect(cacheTiers.list.staleTime).toBeGreaterThan(
      cacheTiers.live.staleTime,
    );
    for (const name of ["list", "document", "live"] as const) {
      expect(cacheTiers[name].refetchOnWindowFocus).toBe(true);
    }
  });
});
