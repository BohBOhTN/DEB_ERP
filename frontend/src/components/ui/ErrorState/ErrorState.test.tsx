import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "./ErrorState.js";

describe("ErrorState", () => {
  it("is an alert with retry and the correlation id", async () => {
    const onRetry = vi.fn();
    render(
      <ErrorState
        title="Une erreur est survenue"
        description="Réessayez."
        onRetry={onRetry}
        correlationId="abc-123"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Une erreur est survenue",
    );
    expect(screen.getByText("abc-123")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("offers the way back home when access is denied", () => {
    render(
      <ErrorState
        variant="denied"
        title="Accès refusé"
        description="Vous n'avez pas l'autorisation d'effectuer cette action."
      />,
    );

    expect(
      screen.getByRole("link", { name: "Retour à l'accueil" }),
    ).toHaveAttribute("href", "/");
  });
});
