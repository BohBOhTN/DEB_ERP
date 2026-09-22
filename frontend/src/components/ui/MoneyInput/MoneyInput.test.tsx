import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { MoneyInput } from "./MoneyInput.js";

function Harness() {
  const [value, setValue] = useState("");

  return (
    <>
      <MoneyInput aria-label="Montant" value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe("MoneyInput", () => {
  it("emits a three-decimal string and shows the currency", async () => {
    render(<Harness />);

    await userEvent.type(
      screen.getByRole("textbox", { name: "Montant" }),
      "12,5",
    );
    await userEvent.tab();

    expect(screen.getByTestId("value")).toHaveTextContent("12.5");
    expect(screen.getByRole("textbox", { name: "Montant" })).toHaveValue(
      "12,500",
    );
    expect(screen.getByText("TND")).toBeInTheDocument();
  });

  it("never goes below zero", async () => {
    render(<Harness />);

    await userEvent.type(
      screen.getByRole("textbox", { name: "Montant" }),
      "-4",
    );
    await userEvent.tab();

    expect(screen.getByTestId("value")).toHaveTextContent("0");
  });
});
