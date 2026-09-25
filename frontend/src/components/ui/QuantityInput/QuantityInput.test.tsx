import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuantityInput } from "./QuantityInput.js";

describe("QuantityInput", () => {
  it("shows the unit as a suffix", () => {
    render(
      <QuantityInput
        aria-label="Quantité"
        value="2.5"
        onChange={() => undefined}
        unit="kg"
      />,
    );

    expect(screen.getByRole("textbox", { name: "Quantité" })).toHaveValue(
      "2,500",
    );
    expect(screen.getByText("kg")).toBeInTheDocument();
  });
});
