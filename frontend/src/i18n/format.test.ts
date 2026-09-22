import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatQuantity,
  formatRelative,
  parseDecimalInput,
  toBusinessDate,
} from "./format.js";

const nbsp = " ";

describe("format", () => {
  it("formats money as a decimal string with three decimals and TND", () => {
    expect(formatMoney("12.5")).toBe(`12,500${nbsp}TND`);
    expect(formatMoney("1250000.125")).toMatch(/^1.250.000,125.TND$/);
    expect(formatMoney("0")).toBe(`0,000${nbsp}TND`);
    expect(formatMoney("-3.2", { unit: false })).toBe("-3,200");
    expect(formatMoney(null)).toBe("—");
  });

  it("formats quantities with a unit and without trailing zeros", () => {
    expect(formatQuantity("2.500", "kg")).toBe(`2,5${nbsp}kg`);
    expect(formatQuantity("1.000", "pièce")).toBe(`1${nbsp}pièce`);
    expect(formatQuantity("0.125")).toBe("0,125");
  });

  // 2026-09-22T23:30Z is already the 23rd in Tunis (UTC+1, no summer time).
  it("formats dates and times in Africa/Tunis", () => {
    const instant = "2026-09-22T23:30:00.000Z";

    expect(formatDate(instant)).toBe("23/09/2026");
    expect(formatDateTime(instant)).toBe("23/09/2026 00:30");
    expect(toBusinessDate(instant)).toBe("2026-09-23");
    expect(formatDate(null)).toBe("—");
  });

  it("formats relative time in short French and falls back to the date", () => {
    const now = new Date("2026-09-22T12:00:00.000Z");

    expect(formatRelative(new Date("2026-09-22T11:59:40.000Z"), now)).toBe(
      "à l'instant",
    );
    expect(formatRelative(new Date("2026-09-22T11:55:00.000Z"), now)).toBe(
      "il y a 5 min",
    );
    expect(formatRelative(new Date("2026-09-22T09:00:00.000Z"), now)).toBe(
      "il y a 3 h",
    );
    expect(formatRelative(new Date("2026-09-20T12:00:00.000Z"), now)).toBe(
      "il y a 2 j",
    );
    expect(formatRelative(new Date("2026-09-01T12:00:00.000Z"), now)).toBe(
      "01/09/2026",
    );
  });

  it("parses what a user types into a decimal string", () => {
    expect(parseDecimalInput("12,5")).toBe("12.5");
    expect(parseDecimalInput("1 250,000")).toBe("1250");
    expect(parseDecimalInput("12.3456")).toBe("12.346");
    expect(parseDecimalInput("abc")).toBeNull();
    expect(parseDecimalInput("")).toBeNull();
  });
});
