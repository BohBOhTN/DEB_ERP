import { describe, expect, it } from "vitest";
import { daysOf, resolvePeriod, shiftDay, weekdayOf } from "./period.js";

/// 4 October 2026, 11:00 in Tunis (UTC+1).
const now = new Date("2026-10-04T10:00:00.000Z");

describe("analytics period", () => {
  it("defaults to the last thirty business days and the thirty before", () => {
    const period = resolvePeriod({}, now);

    expect(period.from).toBe("2026-09-05");
    expect(period.to).toBe("2026-10-04");
    expect(period.days).toBe(30);
    expect(period.previous.from).toBe("2026-08-06");
    expect(period.previous.to).toBe("2026-09-04");
    expect(period.granularity).toBe("day");
    expect(period.buckets).toHaveLength(30);
    expect(period.buckets[0]).toBe("2026-09-05");
    expect(period.buckets.at(-1)).toBe("2026-10-04");
  });

  it("reads the bounds as whole days in Tunis", () => {
    const period = resolvePeriod({ from: "2026-09-05", to: "2026-09-05" }, now);

    expect(period.start.toISOString()).toBe("2026-09-04T23:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-09-05T22:59:59.999Z");
    expect(period.previous.from).toBe("2026-09-04");
    expect(period.previous.to).toBe("2026-09-04");
  });

  it("completes a single bound", () => {
    expect(resolvePeriod({ to: "2026-06-30" }, now).from).toBe("2026-06-01");
    expect(resolvePeriod({ from: "2026-10-01" }, now).to).toBe("2026-10-04");
  });

  it("buckets a long period by month", () => {
    const period = resolvePeriod({ from: "2026-01-01", to: "2026-06-30" }, now);

    expect(period.granularity).toBe("month");
    expect(period.buckets).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
  });

  it("refuses a reversed period with a French field error", () => {
    expect(() =>
      resolvePeriod({ from: "2026-10-04", to: "2026-10-01" }, now),
    ).toThrowError(
      expect.objectContaining({
        statusCode: 400,
        code: "VALIDATION_ERROR",
        fieldErrors: { to: "La date de fin doit suivre la date de début." },
      }),
    );
  });

  it("refuses more than 366 days", () => {
    expect(() =>
      resolvePeriod({ from: "2025-01-01", to: "2026-10-04" }, now),
    ).toThrowError(
      expect.objectContaining({
        statusCode: 400,
        fieldErrors: { from: "La période ne peut pas dépasser 366 jours." },
      }),
    );
    expect(
      resolvePeriod({ from: "2025-10-04", to: "2026-10-04" }, now).days,
    ).toBe(366);
  });

  it("moves and names days as calendar days", () => {
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysOf("2026-12-30", "2027-01-02")).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
    // 4 October 2026 is a Sunday, 5 October a Monday.
    expect(weekdayOf("2026-10-04")).toBe(7);
    expect(weekdayOf("2026-10-05")).toBe(1);
  });
});
