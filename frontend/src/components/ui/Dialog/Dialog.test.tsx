import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Dialog } from "./Dialog.js";

function Harness({ preventClose = false }: { preventClose?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Ouvrir</button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Nouveau client"
        preventClose={preventClose}
      >
        <input aria-label="Nom" />
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("opens with a labelled dialog, traps focus and closes on Escape", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: "Ouvrir" }));
    const dialog = screen.getByRole("dialog", { name: "Nouveau client" });
    expect(dialog).toBeInTheDocument();
    expect(dialog.contains(document.activeElement)).toBe(true);

    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Focus restoration to the opener is a browser behaviour Radix provides;
    // jsdom records no pre-open focus, so the Sprint 19 smoke test covers it.
    await waitFor(() =>
      expect(document.activeElement?.closest("[role='dialog']")).toBeFalsy(),
    );
  });

  it("cannot be closed while a posting is pending", async () => {
    render(<Harness preventClose />);

    await userEvent.click(screen.getByRole("button", { name: "Ouvrir" }));
    await userEvent.keyboard("{Escape}");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Fermer" }),
    ).not.toBeInTheDocument();
  });
});
