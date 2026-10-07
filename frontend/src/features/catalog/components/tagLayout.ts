/// Issue 024: the placement of price tags on an A4 sheet (`DEC-V2-014`).
/// Pure geometry in millimetres, so the page and its tests share one rule.

export interface TagSize {
  widthMm: number;
  heightMm: number;
}

export interface TagSlot {
  /// Top-left corner on the sheet, margin included.
  xMm: number;
  yMm: number;
  /// The box as it sits on the sheet: swapped when the tag is turned.
  widthMm: number;
  heightMm: number;
  /// Turned by a quarter turn to fill a strip the upright tag leaves.
  rotated: boolean;
}

export interface SheetLayout {
  perPage: number;
  rotatedCount: number;
  /// Reading order: top to bottom, left to right.
  slots: TagSlot[];
  /// Share of the printable area the tags cover, 0 to 1.
  usedShare: number;
}

/// A4 portrait, with a margin kept out of the edge a printer cannot reach.
export const SHEET = { widthMm: 210, heightMm: 297, marginMm: 8 } as const;

export const TAG_LIMITS = {
  minWidthMm: 25,
  maxWidthMm: SHEET.widthMm - 2 * SHEET.marginMm,
  minHeightMm: 15,
  maxHeightMm: SHEET.heightMm - 2 * SHEET.marginMm,
} as const;

export const TAG_PRESETS = [
  { id: "small", label: "Petite", widthMm: 50, heightMm: 30 },
  { id: "medium", label: "Moyenne", widthMm: 70, heightMm: 40 },
  { id: "large", label: "Grande", widthMm: 100, heightMm: 60 },
] as const;

export type TagPresetId = (typeof TAG_PRESETS)[number]["id"];

export function presetOf(size: TagSize): TagPresetId | null {
  return (
    TAG_PRESETS.find(
      (preset) =>
        preset.widthMm === size.widthMm && preset.heightMm === size.heightMm,
    )?.id ?? null
  );
}

export function clampTagSize(size: TagSize): TagSize {
  return {
    widthMm: clamp(size.widthMm, TAG_LIMITS.minWidthMm, TAG_LIMITS.maxWidthMm),
    heightMm: clamp(
      size.heightMm,
      TAG_LIMITS.minHeightMm,
      TAG_LIMITS.maxHeightMm,
    ),
  };
}

interface Box {
  widthMm: number;
  heightMm: number;
  rotated: boolean;
}

/// Packs one sheet from its top-left corner with no gap between the tags,
/// so every cut is shared and the waste gathers at the right and the
/// bottom. A grid of one orientation fills the sheet, then the two strips
/// it leaves take the other orientation; the roles are tried both ways and
/// the layout holding the most tags wins, the fewer turned the better.
export function packSheet(tag: TagSize, sheet = SHEET): SheetLayout {
  const areaWidth = sheet.widthMm - 2 * sheet.marginMm;
  const areaHeight = sheet.heightMm - 2 * sheet.marginMm;
  const upright: Box = {
    widthMm: tag.widthMm,
    heightMm: tag.heightMm,
    rotated: false,
  };
  const turned: Box = {
    widthMm: tag.heightMm,
    heightMm: tag.widthMm,
    rotated: true,
  };

  const candidates = [
    fill(upright, turned, "right", areaWidth, areaHeight),
    fill(upright, turned, "bottom", areaWidth, areaHeight),
    fill(turned, upright, "right", areaWidth, areaHeight),
    fill(turned, upright, "bottom", areaWidth, areaHeight),
  ];
  const best = candidates.reduce((winner, candidate) =>
    candidate.length > winner.length ||
    (candidate.length === winner.length &&
      count(candidate, true) < count(winner, true))
      ? candidate
      : winner,
  );
  const slots = best
    .map((slot) => ({
      ...slot,
      xMm: slot.xMm + sheet.marginMm,
      yMm: slot.yMm + sheet.marginMm,
    }))
    .sort((a, b) => a.yMm - b.yMm || a.xMm - b.xMm);

  return {
    perPage: slots.length,
    rotatedCount: count(slots, true),
    slots,
    usedShare:
      (slots.length * tag.widthMm * tag.heightMm) / (areaWidth * areaHeight),
  };
}

/// The main grid, then the strip on `fullSide` over the whole sheet edge
/// and the other strip beside the grid alone, both in the other box.
function fill(
  main: Box,
  other: Box,
  fullSide: "right" | "bottom",
  areaWidth: number,
  areaHeight: number,
): TagSlot[] {
  const cols = Math.floor(areaWidth / main.widthMm);
  const rows = Math.floor(areaHeight / main.heightMm);
  const gridWidth = cols * main.widthMm;
  const gridHeight = rows * main.heightMm;
  const slots = grid(main, 0, 0, gridWidth, gridHeight);

  if (fullSide === "right") {
    slots.push(
      ...grid(other, gridWidth, 0, areaWidth - gridWidth, areaHeight),
      ...grid(other, 0, gridHeight, gridWidth, areaHeight - gridHeight),
    );
  } else {
    slots.push(
      ...grid(other, 0, gridHeight, areaWidth, areaHeight - gridHeight),
      ...grid(other, gridWidth, 0, areaWidth - gridWidth, gridHeight),
    );
  }

  return slots;
}

function grid(
  box: Box,
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
): TagSlot[] {
  const cols = Math.floor(widthMm / box.widthMm);
  const rows = Math.floor(heightMm / box.heightMm);
  const slots: TagSlot[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      slots.push({
        xMm: xMm + col * box.widthMm,
        yMm: yMm + row * box.heightMm,
        widthMm: box.widthMm,
        heightMm: box.heightMm,
        rotated: box.rotated,
      });
    }
  }

  return slots;
}

function count(slots: TagSlot[], rotated: boolean) {
  return slots.filter((slot) => slot.rotated === rotated).length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/// Splits a run of tags into sheets of `perPage`; each sheet pairs a tag
/// with the slot it takes, in reading order.
export function paginate<TTag>(
  tags: TTag[],
  layout: SheetLayout,
): Array<Array<{ tag: TTag; slot: TagSlot }>> {
  if (layout.perPage === 0 || tags.length === 0) {
    return [];
  }

  const sheets: Array<Array<{ tag: TTag; slot: TagSlot }>> = [];

  for (let start = 0; start < tags.length; start += layout.perPage) {
    sheets.push(
      tags
        .slice(start, start + layout.perPage)
        .map((tag, index) => ({ tag, slot: layout.slots[index]! })),
    );
  }

  return sheets;
}
