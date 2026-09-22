import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiTile } from "./KpiTile.js";

describe("KpiTile", () => {
  it("shows label, value, unit and delta", () => {
    render(
      <KpiTile
        label="Ventes du jour"
        value="1 250,000"
        unit="TND"
        delta={{ label: "+12 %", direction: "up" }}
        note="14 ventes"
      />,
    );

    expect(screen.getByText("Ventes du jour")).toBeInTheDocument();
    expect(screen.getByText("1 250,000")).toHaveClass("tabular-nums");
    expect(screen.getByText("+12 %")).toBeInTheDocument();
    expect(screen.getByText("14 ventes")).toBeInTheDocument();
  });

  it("renders a skeleton while loading and a link when given an href", () => {
    const { rerender } = render(<KpiTile label="À payer" value="0" loading />);
    expect(screen.getByLabelText("Chargement")).toBeInTheDocument();

    rerender(<KpiTile label="À payer" value="0" href="/achats?dus=1" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/achats?dus=1");
  });
});
