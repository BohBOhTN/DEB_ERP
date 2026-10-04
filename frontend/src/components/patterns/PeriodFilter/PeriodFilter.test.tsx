import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  analysisPeriodPresets,
  type PeriodValue,
} from "../../../lib/dates/periodRange.js";
import { PeriodFilter } from "./PeriodFilter.js";

function Harness({ onChange }: { onChange?: (value: PeriodValue) => void }) {
  const [value, setValue] = useState<PeriodValue>({
    preset: "today",
    from: "",
    to: "",
  });

  return (
    <PeriodFilter
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe("PeriodFilter", () => {
  it("offers the five presets, captions the days covered and reveals the range for a custom period", async () => {
    const seen: PeriodValue[] = [];
    render(<Harness onChange={(value) => seen.push(value)} />);

    const group = screen.getByRole("radiogroup", { name: "Période" });
    expect(
      screen.getAllByRole("radio").map((radio) => radio.textContent),
    ).toEqual([
      "Aujourd'hui",
      "Hier",
      "Cette semaine",
      "Ce mois",
      "Personnalisée",
    ]);
    expect(group).toHaveTextContent("Aujourd'hui");
    expect(screen.getByText(/^Le \d{2}\/\d{2}\/\d{4}$/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Du" })).toBeNull();

    await userEvent.click(screen.getByRole("radio", { name: "Ce mois" }));
    expect(seen.at(-1)).toEqual({ preset: "month", from: "", to: "" });

    await userEvent.click(screen.getByRole("radio", { name: "Personnalisée" }));
    // The custom range starts from the month that was shown.
    expect(seen.at(-1)?.preset).toBe("custom");
    expect(seen.at(-1)?.from).toMatch(/-01$/);
    const from = screen.getByLabelText("Du");
    const to = screen.getByLabelText("Au");
    expect(from).toBeInTheDocument();
    await userEvent.clear(to);
    await userEvent.clear(from);
    await userEvent.type(from, "2026-09-10");
    expect(seen.at(-1)).toEqual({
      preset: "custom",
      from: "2026-09-10",
      to: "",
    });
    expect(screen.getByText("Le 10/09/2026")).toBeInTheDocument();
    await userEvent.type(to, "2026-09-12");
    expect(screen.getByText("Du 10/09/2026 au 12/09/2026")).toBeInTheDocument();
  });

  it("offers the analysis windows when the page asks for them", async () => {
    const seen: PeriodValue[] = [];
    render(
      <PeriodFilter
        presets={analysisPeriodPresets}
        value={{ preset: "last30", from: "", to: "" }}
        onChange={(value) => seen.push(value)}
      />,
    );

    expect(
      screen.getAllByRole("radio").map((radio) => radio.textContent),
    ).toEqual([
      "Ce mois",
      "30 jours",
      "90 jours",
      "Cette année",
      "Personnalisée",
    ]);
    expect(
      screen.getByText(/^Du \d{2}\/\d{2}\/\d{4} au \d{2}\/\d{2}\/\d{4}$/),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "90 jours" }));
    expect(seen.at(-1)).toEqual({ preset: "last90", from: "", to: "" });
  });
});
