import { describe, expect, it } from "vitest";
import { advanceDateLabel } from "./components/orderLabels.js";

describe("advanceDateLabel", () => {
  // Issue #65: a back-dated deposit is stored at midday Tunis; the list
  // shows the day only, and a real instant with its time.
  it("shows the day alone for a deposit dated by day", () => {
    expect(advanceDateLabel("2026-09-24T11:00:00.000Z")).toBe("24/09/2026");
  });

  it("shows the time for a deposit taken at a real instant", () => {
    expect(advanceDateLabel("2026-09-25T09:12:00.000Z")).toMatch(
      /^25\/09\/2026 .*10:12$/,
    );
  });
});
