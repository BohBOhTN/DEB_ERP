import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button.js";

describe("Button", () => {
  it("renders its label and calls onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Enregistrer</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled and busy while loading, and cannot be clicked", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Valider l'achat
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Valider l'achat" });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Annuler</Button>);

    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("hides decorative icons from assistive technology", () => {
    render(<Button leftIcon={<svg data-testid="icon" />}>Ajouter</Button>);

    expect(screen.getByTestId("icon").parentElement).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
