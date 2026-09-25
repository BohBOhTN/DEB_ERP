import { describe, expect, it } from "vitest";
import { expiryWarningDelayMs } from "./session";

describe("session expiry warning", () => {
  it("fires ten minutes before the session ends", () => {
    const now = Date.parse("2026-09-23T08:00:00.000Z");

    expect(expiryWarningDelayMs("2026-09-23T16:00:00.000Z", now)).toBe(
      7 * 60 * 60 * 1000 + 50 * 60 * 1000,
    );
    expect(expiryWarningDelayMs("2026-09-23T08:05:00.000Z", now)).toBeNull();
    expect(expiryWarningDelayMs(null, now)).toBeNull();
    expect(expiryWarningDelayMs("nope", now)).toBeNull();
  });
});
