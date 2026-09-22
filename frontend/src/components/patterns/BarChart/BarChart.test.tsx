import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
