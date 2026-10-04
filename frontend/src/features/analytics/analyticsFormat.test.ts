import { describe, expect, it } from "vitest";
import {
  bucketLabels,
  hourSlot,
  moneyWithShare,
  periodDelta,
  shareOf,
  weekdayName,
  weekdayShort,
} from "./analyticsFormat";

describe("analytics formatting", () => {
  it("names ISO weekdays and hour slots", () => {
    expect(weekdayName(1)).toBe("Lundi");
    expect(weekdayName(7)).toBe("Dimanche");
    expect(weekdayShort(6)).toBe("Sam");
    expect(hourSlot(9)).toBe("9 h à 10 h");
  });

  it("compares a figure with the previous period without dividing by zero", () => {
    expect(periodDelta("160.000", "40.000")).toEqual({
      label: "+300 % vs période précédente",
      direction: "up",
    });
    expect(periodDelta(45, 60)).toEqual({
      label: "−25 % vs période précédente",
      direction: "down",
    });
    expect(periodDelta("10.000", "10.000").direction).toBe("flat");
    expect(periodDelta("10.000", "0.000")).toEqual({
      label: "Rien sur la période précédente",
      direction: "up",
    });
    expect(periodDelta(0, 0)).toEqual({
      label: "Comme la période précédente",
      direction: "flat",
    });
  });

  it("gives a whole share, zero without a total", () => {
    expect(shareOf("40.000", "160.000")).toBe(25);
    expect(shareOf("1.000", "3.000")).toBe(33);
    expect(shareOf("5.000", "0.000")).toBe(0);
    expect(moneyWithShare("40.000", "160.000")).toMatch(/^40,000.TND · 25 %$/);
  });

  it("labels a day and a month bucket in French", () => {
    expect(bucketLabels("2026-09-12", "day")).toEqual({
      label: "samedi 12/09/2026",
      tick: "12/09",
    });
    expect(bucketLabels("2026-03", "month")).toEqual({
      label: "mars 2026",
      tick: "03/2026",
    });
  });
});
