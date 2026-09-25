import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TotalsCard } from "./TotalsCard.js";

describe("TotalsCard", () => {
  it("shows every figure formatted", () => {
    render(
      <TotalsCard
        subtotalTnd="125"
        paidTnd="100"
        remainingTnd="25"
        totalTnd="125"
        provisional
      />,
    );

    expect(screen.getByText("Reste à payer")).toBeInTheDocument();
    expect(screen.getAllByText(/125,000/)).toHaveLength(2);
    expect(screen.getByText(/^25,000/)).toBeInTheDocument();
    expect(screen.getByText("(provisoire)")).toBeInTheDocument();
  });
});
