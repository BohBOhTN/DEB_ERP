import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog.js";

describe("ConfirmDialog", () => {
  it("shows the impact and confirms", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Valider l'achat"
        impact={
          <ul>
            <li>Le stock de farine augmente de 50 kg.</li>
          </ul>
        }
        confirmLabel="Valider l'achat"
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );

    expect(
      screen.getByRole("alertdialog", { name: "Valider l'achat" }),
    ).toHaveAccessibleDescription(/Le stock de farine augmente de 50 kg/);
    await userEvent.click(
      screen.getByRole("button", { name: "Valider l'achat" }),
    );
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it("requires a reason of at least five characters", async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Annuler la dépense"
        impact="La dépense sera retirée des totaux."
        tone="danger"
        requireReason
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Confirmer" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/Saisissez un motif/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/Motif/), "Double saisie");
    await userEvent.click(screen.getByRole("button", { name: "Confirmer" }));
    expect(onConfirm).toHaveBeenCalledWith("Double saisie");
  });

  it("cannot be dismissed while loading", async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Clôturer"
        impact="…"
        loading
        onConfirm={() => undefined}
        onCancel={onCancel}
      />,
    );

    await userEvent.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Annuler" })).toBeDisabled();
  });
});
