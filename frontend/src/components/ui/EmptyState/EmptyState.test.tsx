import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState.js";

describe("EmptyState", () => {
  it("names what is empty and what to do next", () => {
    render(
      <EmptyState
        title="Aucun fournisseur"
        description="Ajoutez votre premier fournisseur pour enregistrer un achat."
        action={<button>Ajouter un fournisseur</button>}
      />,
    );

    expect(screen.getByText("Aucun fournisseur")).toBeInTheDocument();
    expect(
      screen.getByText(/Ajoutez votre premier fournisseur/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ajouter un fournisseur" }),
    ).toBeInTheDocument();
  });
});
