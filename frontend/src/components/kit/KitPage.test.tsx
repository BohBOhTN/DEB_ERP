import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { kitEntries } from "./KitPage.js";

/// AS-V2-10: every component folder has an example registered in the kit,
/// so the gallery renders each primitive and pattern of the design system.
function componentFolders(group: "ui" | "patterns"): string[] {
  const dir = path.resolve(process.cwd(), "src/components", group);

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

describe("kit gallery", () => {
  it("registers every primitive and pattern with at least one example", () => {
    const registered = new Set(
      kitEntries.map((entry) => `${entry.group}/${entry.name}`),
    );
    const expected = [
      ...componentFolders("ui").map((name) => `ui/${name}`),
      ...componentFolders("patterns").map((name) => `patterns/${name}`),
    ];

    expect(expected.filter((name) => !registered.has(name))).toEqual([]);
    for (const entry of kitEntries) {
      expect(entry.examples.length).toBeGreaterThan(0);
    }
  });

  it("covers the full catalogue of the design system", () => {
    const names = new Set(kitEntries.map((entry) => entry.name));
    const catalogue = [
      "Button",
      "IconButton",
      "Badge",
      "StatusPill",
      "Card",
      "FormField",
      "TextInput",
      "TextArea",
      "NumberInput",
      "MoneyInput",
      "QuantityInput",
      "DateInput",
      "DateTimeInput",
      "Select",
      "Combobox",
      "Checkbox",
      "Switch",
      "RadioGroup",
      "SegmentedControl",
      "Dialog",
      "Sheet",
      "ConfirmDialog",
      "DropdownMenu",
      "Tooltip",
      "Toast",
      "Skeleton",
      "EmptyState",
      "ErrorState",
      "Avatar",
      "Tabs",
      "Progress",
      "Spinner",
      "Kbd",
      "VisuallyHidden",
      "AppShell",
      "PageHeader",
      "FilterBar",
      "DataTable",
      "DetailPanel",
      "KeyValueList",
      "KpiTile",
      "KpiGrid",
      "BarChart",
      "Sparkline",
      "RankedList",
      "Timeline",
      "StatementTable",
      "LineEditor",
      "TotalsCard",
      "PaymentBox",
      "PermissionGate",
      "FormDialog",
      "ConfirmPostingDialog",
      "SessionBanner",
      "StockBadge",
    ];

    expect(catalogue.filter((name) => !names.has(name))).toEqual([]);
  });
});
