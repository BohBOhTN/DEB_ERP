import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DropdownMenu } from "./DropdownMenu.js";

describe("DropdownMenu", () => {
  it("opens from the trigger, hides gated items and runs the selected action", async () => {
    const onEdit = vi.fn();
    render(
      <DropdownMenu
        trigger={<button>Actions</button>}
        items={[
          { id: "edit", label: "Modifier", onSelect: onEdit },
          { id: "reset", label: "Réinitialiser le mot de passe", hidden: true },
          {
            id: "deactivate",
            label: "Désactiver",
            danger: true,
            separatorBefore: true,
          },
        ]}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Réinitialiser le mot de passe" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("menuitem", { name: "Modifier" }));
    expect(onEdit).toHaveBeenCalled();
  });
});
