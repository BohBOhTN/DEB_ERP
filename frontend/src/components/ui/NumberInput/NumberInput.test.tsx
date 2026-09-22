import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { NumberInput } from "./NumberInput.js";

function Harness({ decimals = 3, min }: { decimals?: number; min?: string }) {
  const [value, setValue] = useState("");

  return (
    <>
      <NumberInput
        aria-label="Quantité"
        value={value}
        onChange={setValue}
        decimals={decimals}
        min={min}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe("NumberInput", () => {
  it("accepts a comma while typing and emits a decimal string", async () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Quantité" });

    await userEvent.type(input, "2,5");

    expect(screen.getByTestId("value")).toHaveTextContent("2.5");
  });

  it("formats with a comma and fixed decimals on blur", async () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Quantité" });

    await userEvent.type(input, "12.5");
    await userEvent.tab();

    expect(input).toHaveValue("12,500");
  });

  it("refuses letters and clamps to the minimum", async () => {
    render(<Harness min="1" />);
    const input = screen.getByRole("textbox", { name: "Quantité" });

    await userEvent.type(input, "abc0");
    await userEvent.tab();

    expect(input).toHaveValue("1,000");
    expect(screen.getByTestId("value")).toHaveTextContent("1");
  });
});
