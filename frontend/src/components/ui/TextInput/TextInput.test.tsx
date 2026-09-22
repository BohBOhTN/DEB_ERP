import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TextInput } from "./TextInput.js";

describe("TextInput", () => {
  it("forwards typing and marks invalid state", async () => {
    const onChange = vi.fn();
    render(<TextInput aria-label="Nom" invalid onChange={onChange} />);

    const input = screen.getByRole("textbox", { name: "Nom" });
    await userEvent.type(input, "Pain");

    expect(onChange).toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("renders prefix and suffix as decoration", () => {
    render(<TextInput aria-label="Prix" prefix="TND" suffix="/ kg" />);

    expect(screen.getByText("TND")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("/ kg")).toHaveAttribute("aria-hidden", "true");
  });
});
