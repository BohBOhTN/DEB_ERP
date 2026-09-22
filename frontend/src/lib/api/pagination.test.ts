import { describe, expect, it } from "vitest";
import { fromSearchParams, parseSort, toSearchParams } from "./pagination.js";

describe("pagination", () => {
  it("reads the list state from the URL with contract defaults", () => {
    expect(fromSearchParams(new URLSearchParams(""))).toEqual({
      page: 1,
      pageSize: 25,
    });
    expect(
      fromSearchParams(
        new URLSearchParams("page=3&pageSize=50&q=farine&sort=name:desc"),
      ),
    ).toEqual({
      page: 3,
      pageSize: 50,
      q: "farine",
      sort: { field: "name", direction: "desc" },
    });
  });

  it("ignores invalid values and caps the page size", () => {
    expect(
      fromSearchParams(new URLSearchParams("page=-1&pageSize=999")),
    ).toEqual({
      page: 1,
      pageSize: 100,
    });
    expect(parseSort("drop table:asc")).toBeUndefined();
    expect(parseSort("name:sideways")).toEqual({
      field: "name",
      direction: "asc",
    });
  });

  it("serialises only the values that carry information", () => {
    expect(
      toSearchParams({
        page: 2,
        pageSize: 25,
        q: "",
        sort: { field: "createdAt", direction: "desc" },
        isActive: true,
        from: new Date("2026-09-22T00:00:00.000Z"),
      }),
    ).toEqual({
      page: "2",
      pageSize: "25",
      sort: "createdAt:desc",
      isActive: "true",
      from: "2026-09-22T00:00:00.000Z",
    });
  });
});
