import { describe, expect, it } from "vitest";
import {
  clampTagSize,
  packSheet,
  paginate,
  presetOf,
  SHEET,
  TAG_PRESETS,
} from "./tagLayout.js";

describe("packSheet", () => {
  it("fills the right strip with turned tags when they fit", () => {
    const layout = packSheet({ widthMm: 70, heightMm: 40 });

    // 194 × 281 mm printable: two columns of seven upright tags, then one
    // column of four turned tags in the 54 mm left on the right.
    expect(layout.perPage).toBe(18);
    expect(layout.rotatedCount).toBe(4);
    expect(layout.slots[0]).toEqual({
      xMm: SHEET.marginMm,
      yMm: SHEET.marginMm,
      widthMm: 70,
      heightMm: 40,
      rotated: false,
    });
    expect(layout.slots[2]).toEqual({
      xMm: SHEET.marginMm + 140,
      yMm: SHEET.marginMm,
      widthMm: 40,
      heightMm: 70,
      rotated: true,
    });
    expect(layout.usedShare).toBeCloseTo((18 * 70 * 40) / (194 * 281), 6);
  });

  it("turns the main grid when that holds more tags", () => {
    const layout = packSheet({ widthMm: 50, heightMm: 30 });

    // Upright: 3 × 9 plus 5 turned on the right, 32. Turned: 6 × 5 plus
    // three upright in the 31 mm left at the bottom, 33.
    expect(layout.perPage).toBe(33);
    expect(layout.rotatedCount).toBe(30);
    expect(layout.slots.at(-1)).toEqual({
      xMm: SHEET.marginMm + 100,
      yMm: SHEET.marginMm + 250,
      widthMm: 50,
      heightMm: 30,
      rotated: false,
    });
  });

  it("packs the large preset seven to a sheet", () => {
    const layout = packSheet({ widthMm: 100, heightMm: 60 });

    expect(layout.perPage).toBe(7);
    expect(layout.rotatedCount).toBe(6);
  });

  it("keeps the upright grid on a tie", () => {
    // Square tags: both orientations give the same count.
    const layout = packSheet({ widthMm: 60, heightMm: 60 });

    expect(layout.perPage).toBe(12);
    expect(layout.rotatedCount).toBe(0);
  });

  it("orders the slots top to bottom, left to right", () => {
    const layout = packSheet({ widthMm: 70, heightMm: 40 });
    const keys = layout.slots.map((slot) => [slot.yMm, slot.xMm]);
    const sorted = [...keys].sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!);

    expect(keys).toEqual(sorted);
  });

  it("never lets two slots overlap nor leave the printable area", () => {
    for (const size of [
      { widthMm: 70, heightMm: 40 },
      { widthMm: 50, heightMm: 30 },
      { widthMm: 100, heightMm: 60 },
      { widthMm: 33, heightMm: 21 },
      { widthMm: 194, heightMm: 281 },
    ]) {
      const { slots } = packSheet(size);

      for (const slot of slots) {
        expect(slot.xMm).toBeGreaterThanOrEqual(SHEET.marginMm);
        expect(slot.yMm).toBeGreaterThanOrEqual(SHEET.marginMm);
        expect(slot.xMm + slot.widthMm).toBeLessThanOrEqual(
          SHEET.widthMm - SHEET.marginMm + 1e-9,
        );
        expect(slot.yMm + slot.heightMm).toBeLessThanOrEqual(
          SHEET.heightMm - SHEET.marginMm + 1e-9,
        );
      }

      for (const a of slots) {
        for (const b of slots) {
          if (a === b) continue;
          const apart =
            a.xMm + a.widthMm <= b.xMm + 1e-9 ||
            b.xMm + b.widthMm <= a.xMm + 1e-9 ||
            a.yMm + a.heightMm <= b.yMm + 1e-9 ||
            b.yMm + b.heightMm <= a.yMm + 1e-9;
          expect(apart).toBe(true);
        }
      }
    }
  });

  it("gives one tag per sheet at the limits", () => {
    expect(packSheet({ widthMm: 194, heightMm: 281 }).perPage).toBe(1);
  });
});

describe("clampTagSize and presetOf", () => {
  it("brings a size back inside the printable area", () => {
    expect(clampTagSize({ widthMm: 250, heightMm: 10 })).toEqual({
      widthMm: 194,
      heightMm: 15,
    });
    expect(clampTagSize({ widthMm: 70, heightMm: 40 })).toEqual({
      widthMm: 70,
      heightMm: 40,
    });
  });

  it("names the preset a size matches", () => {
    expect(presetOf({ widthMm: 70, heightMm: 40 })).toBe("medium");
    expect(presetOf({ widthMm: 71, heightMm: 40 })).toBeNull();
    expect(TAG_PRESETS.map((preset) => preset.id)).toEqual([
      "small",
      "medium",
      "large",
    ]);
  });
});

describe("paginate", () => {
  it("splits the tags into sheets in slot order", () => {
    const layout = packSheet({ widthMm: 70, heightMm: 40 });
    const tags = Array.from({ length: 40 }, (_, index) => `tag-${index}`);
    const sheets = paginate(tags, layout);

    expect(sheets).toHaveLength(3);
    expect(sheets[0]).toHaveLength(18);
    expect(sheets[2]).toHaveLength(4);
    expect(sheets[1]![0]).toEqual({ tag: "tag-18", slot: layout.slots[0] });
  });

  it("returns no sheet without tags", () => {
    expect(paginate([], packSheet({ widthMm: 70, heightMm: 40 }))).toEqual([]);
  });
});
