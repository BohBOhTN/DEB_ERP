import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockViewport } from "../../../test/viewport.js";
import { BarChart } from "./BarChart.js";

const data = [
  { label: "Pains", value: 820, formatted: "820,000 TND" },
  { label: "Pâtisserie", value: 430, formatted: "430,000 TND" },
];

describe("BarChart", () => {
  it("is a labelled figure with a readable value per bar", () => {
    render(<BarChart title="Ventes par catégorie" data={data} />);

    expect(
      screen.getByRole("figure", { name: "Ventes par catégorie" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Pains : 820,000 TND")).toBeInTheDocument();
  });

  it("makes vertical bars focusable buttons", () => {
    render(<BarChart title="Par jour" data={data} orientation="vertical" />);

    expect(
      screen.getByRole("button", { name: "Pâtisserie : 430,000 TND" }),
    ).toBeInTheDocument();
  });

  // A finger has no hover and no tooltip: the line under the columns says
  // the highest bar first, then the bar that is tapped or focused.
  it("reads the highest column, then the one that is tapped", async () => {
    const { container } = render(
      <BarChart title="Par jour" data={data} orientation="vertical" />,
    );

    const readout = container.querySelector('[aria-live="polite"]');
    expect(readout).toHaveTextContent("Pains : 820,000 TND");

    await userEvent.click(
      screen.getByRole("button", { name: "Pâtisserie : 430,000 TND" }),
    );
    expect(readout).toHaveTextContent("Pâtisserie : 430,000 TND");
  });

  it("sizes every column by its value and keeps a stub for zero", () => {
    render(
      <BarChart
        title="Par heure"
        orientation="vertical"
        data={[
          { label: "7h", value: 30, formatted: "30 ventes" },
          { label: "8h", value: 60, formatted: "60 ventes" },
          { label: "9h", value: 0, formatted: "0 vente" },
        ]}
      />,
    );

    const bar = (name: string) =>
      screen.getByRole("button", { name }).querySelector("span");
    expect(bar("8h : 60 ventes")).toHaveStyle({ height: "100%" });
    expect(bar("7h : 30 ventes")).toHaveStyle({ height: "50%" });
    expect(bar("9h : 0 vente")).toHaveStyle({ height: "0%" });
  });

  it("prints every second label when a phone has no room for all of them", () => {
    mockViewport(360);
    const hours = Array.from({ length: 16 }, (_, index) => ({
      label: `${index + 6}h`,
      value: index,
      formatted: `${index} ventes`,
    }));
    render(<BarChart title="Par heure" data={hours} orientation="vertical" />);

    // Sixteen bars, all of them reachable and labelled for a screen reader.
    expect(screen.getAllByRole("button")).toHaveLength(16);
    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.textContent)
        .filter(Boolean),
    ).toEqual(["6h", "8h", "10h", "12h", "14h", "16h", "18h", "20h"]);
  });
});
