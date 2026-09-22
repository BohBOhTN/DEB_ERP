import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../../../lib/api/errors.js";
import { Toaster } from "./Toast.js";
import { useToastStore } from "./toastStore.js";
import { useToast } from "./useToast.js";

function Trigger() {
  const toast = useToast();

  return (
    <>
      <button
        onClick={() =>
          toast.success("Achat validé", "AC-000012 est passé à l'état Validé.")
        }
      >
        Succès
      </button>
      <button
        onClick={() =>
          toast.fromError(
            new ApiError({
              code: "VERSION_CONFLICT",
              message: "Cette fiche a été modifiée.",
              status: 409,
            }),
          )
        }
      >
        Erreur
      </button>
    </>
  );
}

describe("Toast", () => {
  beforeEach(() => {
    useToastStore.getState().clear();
  });

  it("shows a success toast and lets the user close it", async () => {
    render(
      <>
        <Trigger />
        <Toaster />
      </>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Succès" }));
    expect(screen.getByText("Achat validé")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.queryByText("Achat validé")).not.toBeInTheDocument();
  });

  it("turns an ApiError into French copy", async () => {
    render(
      <>
        <Trigger />
        <Toaster />
      </>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Erreur" }));

    expect(screen.getByText("Fiche modifiée entre-temps")).toBeInTheDocument();
    expect(screen.getByText("Cette fiche a été modifiée.")).toBeInTheDocument();
  });

  it("keeps at most three toasts", () => {
    act(() => {
      for (let index = 0; index < 5; index += 1) {
        useToastStore
          .getState()
          .push({ kind: "info", title: `Toast ${index}` });
      }
    });

    expect(useToastStore.getState().toasts.map((toast) => toast.title)).toEqual(
      ["Toast 2", "Toast 3", "Toast 4"],
    );
  });
});
