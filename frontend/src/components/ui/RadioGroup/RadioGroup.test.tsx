import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RadioGroup } from "./RadioGroup.js";

const options = [
  { value: "REFUND", label: "Rembourser l'acompte" },
  { value: "CREDIT", label: "Conserver en avoir" },
];

describe("RadioGroup", () => {
  it("selects an option by click and by keyboard", async () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup
        label="Sort de l'acompte"
        options={options}
        onValueChange={onValueChange}
      />,
    );

    await userEvent.click(
      screen.getByRole("radio", { name: "Rembourser l'acompte" }),
    );
    expect(onValueChange).toHaveBeenLastCalledWith("REFUND");

    // Held like a real key press: Radix selects on focus while the arrow is down.
    await userEvent.keyboard("{ArrowDown>}");
    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "Conserver en avoir" }),
      ).toBeChecked(),
    );
    await userEvent.keyboard("{/ArrowDown}");
    expect(
      screen.getByRole("radiogroup", { name: "Sort de l'acompte" }),
    ).toBeInTheDocument();
  });
});
