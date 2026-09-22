import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StockBadge } from "./StockBadge.js";

describe("StockBadge", () => {
  it("names a negative stock explicitly", () => {
    render(<StockBadge quantity="-2.5" unit="kg" />);

    expect(screen.getByText(/stock négatif/)).toBeInTheDocument();
    expect(screen.getByText(/-2,5/)).toBeInTheDocument();
  });

  it("shows a plain quantity otherwise", () => {
    render(<StockBadge quantity="12" unit="pièce" lowThreshold="5" />);

    expect(screen.queryByText(/stock négatif/)).not.toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });
});
