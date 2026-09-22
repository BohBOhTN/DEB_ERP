import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox.js";

describe("Checkbox", () => {
  it("toggles from the label and reports the change", async () => {
    const onCheckedChange = vi.fn();
    render(
      <Checkbox
        label="Valider immédiatement"
        onCheckedChange={onCheckedChange}
      />,
    );

    await userEvent.click(screen.getByText("Valider immédiatement"));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(
      screen.getByRole("checkbox", { name: "Valider immédiatement" }),
    ).toBeChecked();
  });

  it("toggles with the keyboard", async () => {
    render(<Checkbox label="Actif" defaultChecked />);
    const box = screen.getByRole("checkbox", { name: "Actif" });

    box.focus();
    await userEvent.keyboard(" ");

    expect(box).not.toBeChecked();
  });
});
