import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrendChart, type TrendPoint } from "./TrendChart.js";

const money = (value: number) => `${value},000 TND`;
const points: TrendPoint[] = [
  { day: "10/09", value: 50, comparison: 40 },
  { day: "11/09", value: 0, comparison: 20 },
  { day: "12/09", value: 110, comparison: 0 },
].map((point) => ({
  label: `${point.day}/2026`,
  tick: point.day,
  value: point.value,
  formatted: money(point.value),
  comparison: point.comparison,
  comparisonFormatted: money(point.comparison),
}));

describe("TrendChart", () => {
  it("is a named picture with its legend and the top of its scale", () => {
    render(
      <TrendChart
        title="Chiffre d'affaires par jour"
        points={points}
        seriesLabel="Période"
        comparisonLabel="Période précédente"
        formatScale={money}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Chiffre d'affaires par jour" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Période précédente")).toBeInTheDocument();
    expect(screen.getByText("Maximum 110,000 TND")).toBeInTheDocument();
    expect(screen.getByText("10/09")).toBeInTheDocument();
  });

  it("reads a point and its comparison through the keyboard scrubber", () => {
    render(
      <TrendChart
        title="Chiffre d'affaires par jour"
        points={points}
        seriesLabel="Période"
        comparisonLabel="Période précédente"
        formatScale={money}
      />,
    );

    const scrubber = screen.getByRole("slider", {
      name: "Chiffre d'affaires par jour : parcourir les points",
    });
    fireEvent.change(scrubber, { target: { value: "0" } });

    expect(
      screen.getByText(
        "10/09/2026 : Période 50,000 TND · Période précédente 40,000 TND",
      ),
    ).toBeInTheDocument();
    expect(scrubber).toHaveAttribute(
      "aria-valuetext",
      "10/09/2026 : 50,000 TND · avant 40,000 TND",
    );
  });

  it("drops the comparison when the series has none", () => {
    render(
      <TrendChart
        title="Par mois"
        points={points.map((point) => ({ ...point, comparison: null }))}
        seriesLabel="Chiffre d'affaires"
        comparisonLabel="Période précédente"
        formatScale={money}
      />,
    );

    expect(screen.queryByText("Période précédente")).toBeNull();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "1" } });
    expect(
      screen.getByText("11/09/2026 : Chiffre d'affaires 0,000 TND"),
    ).toBeInTheDocument();
  });
});
