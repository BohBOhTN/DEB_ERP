import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SegmentedControl } from "./SegmentedControl.js";

const options = [
  { value: "today", label: "Aujourd'hui" },
  { value: "yesterday", label: "Hier" },
  { value: "week", label: "7 jours" },
];

function Harness() {
  const [value, setValue] = useState("today");

  return (
    <SegmentedControl
      label="Période"
      options={options}
      value={value}
      onValueChange={setValue}
    />
  );
}

describe("SegmentedControl", () => {
  it("selects by click and moves with arrow keys", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole("radio", { name: "Hier" }));
    expect(screen.getByRole("radio", { name: "Hier" })).toBeChecked();

    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "7 jours" })).toBeChecked();

    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Aujourd'hui" })).toBeChecked();
  });

  it("has a single tab stop", () => {
    render(<Harness />);

    expect(screen.getByRole("radio", { name: "Aujourd'hui" })).toHaveAttribute(
      "tabindex",
      "0",
    );
    expect(screen.getByRole("radio", { name: "Hier" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });
});
