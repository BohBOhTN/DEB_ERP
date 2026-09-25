import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  dateRangeFields,
  endOfBusinessDay,
  orderByFor,
  pageFields,
  searchFields,
  sortField,
  startOfBusinessDay,
  withSearch,
} from "./listQuery.js";

const schema = z.object({
  ...pageFields,
  ...searchFields,
  ...dateRangeFields,
  sort: sortField(["name", "createdAt"]),
});

describe("list query", () => {
  it("parses sort into a field and direction from the whitelist", () => {
    expect(schema.parse({ sort: "name" }).sort).toEqual({
      field: "name",
      direction: "asc",
    });
    expect(schema.parse({ sort: "createdAt:desc" }).sort).toEqual({
      field: "createdAt",
      direction: "desc",
    });
  });

  it("rejects a sort field outside the whitelist", () => {
    expect(() => schema.parse({ sort: "passwordHash:asc" })).toThrow();
    expect(() => schema.parse({ sort: "name:sideways" })).toThrow();
  });

  it("resolves q and search to one search value", () => {
    expect(withSearch(schema.parse({ q: "farine" })).search).toBe("farine");
    expect(withSearch(schema.parse({ search: "sucre" })).search).toBe("sucre");
    expect(withSearch(schema.parse({})).search).toBeUndefined();
  });

  // A business day in Tunis (UTC+1) runs from 23:00 UTC the day before to
  // 22:59:59.999 UTC.
  it("interprets from and to as whole business days in Africa/Tunis", () => {
    const parsed = schema.parse({ from: "2026-09-22", to: "2026-09-22" });

    expect(parsed.from?.toISOString()).toBe("2026-09-21T23:00:00.000Z");
    expect(parsed.to?.toISOString()).toBe("2026-09-22T22:59:59.999Z");
    expect(startOfBusinessDay("2026-01-01").toISOString()).toBe(
      "2025-12-31T23:00:00.000Z",
    );
    expect(endOfBusinessDay("2026-01-01").getTime()).toBeGreaterThan(
      startOfBusinessDay("2026-01-01").getTime(),
    );
  });

  it("still accepts an exact instant", () => {
    const parsed = schema.parse({ from: "2026-09-22T10:30:00.000Z" });

    expect(parsed.from?.toISOString()).toBe("2026-09-22T10:30:00.000Z");
  });

  it("always adds the id tiebreak to the order", () => {
    type Order = Record<string, "asc" | "desc">;
    const columns: Record<
      "name" | "createdAt",
      (direction: "asc" | "desc") => Order[]
    > = {
      name: (direction) => [{ name: direction }],
      createdAt: (direction) => [{ createdAt: direction }],
    };

    expect(
      orderByFor<"name" | "createdAt", Order>(
        { field: "name", direction: "desc" },
        columns,
        [{ createdAt: "desc" }],
        { id: "asc" },
      ),
    ).toEqual([{ name: "desc" }, { id: "asc" }]);
    expect(
      orderByFor<"name" | "createdAt", Order>(
        undefined,
        columns,
        [{ createdAt: "desc" }],
        { id: "asc" },
      ),
    ).toEqual([{ createdAt: "desc" }, { id: "asc" }]);
  });
});
