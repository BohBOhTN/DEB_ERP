import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  decimalString,
  optionalPhone,
  quantity,
  requiredString,
  tnd,
} from "./schemas.js";

describe("form schemas", () => {
  it("normalises comma decimals into decimal strings", () => {
    expect(tnd().parse("12,5")).toBe("12.5");
    expect(tnd().parse("0")).toBe("0");
    expect(quantity().parse("2,250")).toBe("2.25");
  });

  it("rejects negatives, zero when positive is required, and too many decimals", () => {
    expect(() => tnd().parse("-1")).toThrow();
    expect(() => tnd({ positive: true }).parse("0")).toThrow();
    expect(() => decimalString(2).parse("1.234")).toThrow();
    expect(() => tnd().parse("abc")).toThrow();
  });

  it("produces French messages", () => {
    const result = z
      .object({ name: requiredString(3, 10) })
      .safeParse({ name: "ab" });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Saisissez au moins 3 caractères.",
    );
  });

  it("treats an empty optional phone as absent", () => {
    expect(optionalPhone.parse("")).toBeUndefined();
    expect(optionalPhone.parse("+216 22 333 444")).toBe("+216 22 333 444");
    expect(() => optionalPhone.parse("12")).toThrow();
  });
});
