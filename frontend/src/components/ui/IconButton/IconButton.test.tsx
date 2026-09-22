import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IconButton } from "./IconButton.js";

describe("IconButton", () => {
  it("exposes its label as the accessible name", () => {
    render(<IconButton label="Modifier" icon={<svg />} />);

    expect(
      screen.getByRole("button", { name: "Modifier" }),
    ).toBeInTheDocument();
  });

  it("is disabled while loading", () => {
    render(<IconButton label="Supprimer" icon={<svg />} loading />);

    expect(screen.getByRole("button", { name: "Supprimer" })).toBeDisabled();
  });
});
