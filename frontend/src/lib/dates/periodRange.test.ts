import { describe, expect, it } from "vitest";
import {
  periodCaption,
  periodFromParams,
  periodRange,
  periodToParams,
  shiftBusinessDate,
} from "./periodRange.js";

// Wednesday 23 September 2026 at 23:30 UTC is already Thursday 24 in Tunis.
const now = new Date("2026-09-23T23:30:00.000Z");

describe("periodRange", () => {
  it("resolves the presets on the Tunis business day", () => {
    expect(periodRange({ preset: "today", from: "", to: "" }, now)).toEqual({
      from: "2026-09-24",
      to: "2026-09-24",
    });
    expect(periodRange({ preset: "yesterday", from: "", to: "" }, now)).toEqual(
      { from: "2026-09-23", to: "2026-09-23" },
    );
    // Thursday: the week started on Monday 21.
    expect(periodRange({ preset: "week", from: "", to: "" }, now)).toEqual({
      from: "2026-09-21",
      to: "2026-09-24",
    });
    expect(periodRange({ preset: "month", from: "", to: "" }, now)).toEqual({
      from: "2026-09-01",
      to: "2026-09-24",
    });
  });

  it("resolves the analysis windows: thirty days, ninety days, the year", () => {
    expect(periodRange({ preset: "last30", from: "", to: "" }, now)).toEqual({
      from: "2026-08-26",
      to: "2026-09-24",
    });
    expect(periodRange({ preset: "last90", from: "", to: "" }, now)).toEqual({
      from: "2026-06-27",
      to: "2026-09-24",
    });
    expect(periodRange({ preset: "year", from: "", to: "" }, now)).toEqual({
      from: "2026-01-01",
      to: "2026-09-24",
    });
    expect(
      periodFromParams({ period: "last90", from: "", to: "" }, "today").preset,
    ).toBe("last90");
    expect(
      periodFromParams({ period: "decade", from: "", to: "" }, "last30").preset,
    ).toBe("last30");
  });

  it("keeps a week and a month inside their calendar boundaries", () => {
    // Monday 5 October: the week is that single day so far.
    const monday = new Date("2026-10-05T08:00:00.000Z");
    expect(periodRange({ preset: "week", from: "", to: "" }, monday)).toEqual({
      from: "2026-10-05",
      to: "2026-10-05",
    });
    // 1 October at 00:30 Tunis (30 September 23:30 UTC): the month is one day.
    const first = new Date("2026-09-30T23:30:00.000Z");
    expect(periodRange({ preset: "month", from: "", to: "" }, first)).toEqual({
      from: "2026-10-01",
      to: "2026-10-01",
    });
    expect(shiftBusinessDate("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("treats a custom period as one day, a range, or every date", () => {
    expect(
      periodRange({ preset: "custom", from: "2026-09-10", to: "" }, now),
    ).toEqual({ from: "2026-09-10", to: "2026-09-10" });
    expect(
      periodRange(
        { preset: "custom", from: "2026-09-12", to: "2026-09-10" },
        now,
      ),
    ).toEqual({ from: "2026-09-10", to: "2026-09-12" });
    expect(periodRange({ preset: "custom", from: "", to: "" }, now)).toEqual({
      from: "",
      to: "",
    });
  });

  it("captions a day, a range and the absence of a filter", () => {
    const format = (value: string) => value.split("-").reverse().join("/");
    expect(
      periodCaption({ from: "2026-09-24", to: "2026-09-24" }, format),
    ).toBe("Le 24/09/2026");
    expect(
      periodCaption({ from: "2026-09-21", to: "2026-09-24" }, format),
    ).toBe("Du 21/09/2026 au 24/09/2026");
    expect(periodCaption({ from: "", to: "" }, format)).toBe(
      "Toutes les dates",
    );
  });

  it("round-trips through URL parameters and stores dates for custom only", () => {
    expect(
      periodFromParams({ period: "week", from: "x", to: "y" }, "today"),
    ).toEqual({ preset: "week", from: "", to: "" });
    expect(
      periodFromParams({ period: "bogus", from: "", to: "" }, "month"),
    ).toEqual({ preset: "month", from: "", to: "" });
    expect(
      periodToParams({ preset: "custom", from: "2026-09-01", to: "" }),
    ).toEqual({ period: "custom", from: "2026-09-01", to: "" });
    expect(
      periodToParams({ preset: "today", from: "2026-09-01", to: "" }),
    ).toEqual({ period: "today", from: "", to: "" });
  });
});
