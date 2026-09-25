import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../lib/api/errors.js";
import { ConfirmPostingDialog } from "./ConfirmPostingDialog.js";

describe("ConfirmPostingDialog", () => {
  it("reuses the same idempotency key on retry after a network failure", async () => {
    const onPost = vi
      .fn<(key: string) => Promise<void>>()
      .mockRejectedValueOnce(
        new ApiError({ code: "NETWORK_ERROR", message: "", status: 0 }),
      )
      .mockResolvedValueOnce(undefined);
    const onPosted = vi.fn();
    render(
      <ConfirmPostingDialog
        open
        title="Valider la vente"
        impact="Le stock diminue."
        confirmLabel="Encaisser"
        onPost={onPost}
        onPosted={onPosted}
        onCancel={() => undefined}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Encaisser" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("sans doublon");

    await userEvent.click(screen.getByRole("button", { name: "Encaisser" }));
    expect(onPosted).toHaveBeenCalled();
    expect(onPost).toHaveBeenCalledTimes(2);
    expect(onPost.mock.calls[0]?.[0]).toBe(onPost.mock.calls[1]?.[0]);
    expect(onPost.mock.calls[0]?.[0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("takes a new key after a business refusal", async () => {
    const onPost = vi
      .fn<(key: string) => Promise<void>>()
      .mockRejectedValueOnce(
        new ApiError({
          code: "POS_SESSION_NOT_OPEN",
          message: "Ouvrez la caisse.",
          status: 409,
        }),
      )
      .mockResolvedValueOnce(undefined);
    render(
      <ConfirmPostingDialog
        open
        title="Valider"
        impact="…"
        onPost={onPost}
        onCancel={() => undefined}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Confirmer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ouvrez la caisse.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(onPost.mock.calls[0]?.[0]).not.toBe(onPost.mock.calls[1]?.[0]);
  });
});
