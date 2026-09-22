import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tooltip, TooltipProvider } from "./Tooltip.js";

describe("Tooltip", () => {
  it("shows its content on focus", async () => {
    render(
      <TooltipProvider>
        <Tooltip content="Ouvrir la caisse">
          <button aria-label="Caisse">C</button>
        </Tooltip>
      </TooltipProvider>,
    );

    await userEvent.tab();

    expect(await screen.findAllByText("Ouvrir la caisse")).not.toHaveLength(0);
  });
});
