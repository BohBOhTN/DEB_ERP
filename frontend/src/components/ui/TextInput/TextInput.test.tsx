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

  it("renders prefix and suffix beside the field, and a suffix control stays reachable", () => {
    render(
      <TextInput
        aria-label="Prix"
        prefix="TND"
        suffix={<button type="button">Afficher</button>}
      />,
    );

    expect(screen.getByText("TND")).toBeInTheDocument();
    // The suffix may hold the password toggle: it is never aria-hidden.
    expect(screen.getByRole("button", { name: "Afficher" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Afficher" }).closest("[aria-hidden]"),
    ).toBeNull();
  });
});
