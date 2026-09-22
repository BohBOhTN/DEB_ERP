import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "./Sheet.js";

describe("Sheet", () => {
  it("renders a labelled dialog that closes from its button", async () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open onOpenChange={onOpenChange} title="Filtres" side="bottom">
        Contenu
      </Sheet>,
    );

    expect(screen.getByRole("dialog", { name: "Filtres" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
