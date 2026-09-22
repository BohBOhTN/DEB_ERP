import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DetailPanel } from "./DetailPanel.js";

describe("DetailPanel", () => {
  it("renders inline as a labelled section", () => {
    render(
      <DetailPanel
        title="Achat AC-000012"
        meta={<span>Validé</span>}
        actions={<button>Annuler l'achat</button>}
      >
        Lignes
      </DetailPanel>,
    );

    expect(
      screen.getByRole("region", { name: "Achat AC-000012" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Achat AC-000012" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Annuler l'achat" }),
    ).toBeInTheDocument();
  });

  it("opens as a sheet", () => {
    render(
      <DetailPanel mode="sheet" open title="Client">
        Solde
      </DetailPanel>,
    );

    expect(screen.getByRole("dialog", { name: "Client" })).toHaveTextContent(
      "Solde",
    );
  });
});
