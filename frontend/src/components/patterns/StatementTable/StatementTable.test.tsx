import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatementTable } from "./StatementTable.js";

describe("StatementTable", () => {
  it("shows the range, the basis, both balances and the entries", () => {
    render(
      <StatementTable
        label="Relevé client"
        rangeLabel="Du 01/09/2026 au 22/09/2026"
        basisLabel="Solde = ventes à crédit − règlements"
        openingBalanceTnd="100"
        closingBalanceTnd="62.5"
        entries={[
          {
            id: "1",
            at: "2026-09-10T08:00:00.000Z",
            reference: "VT-000010",
            label: "Vente à crédit",
            debitTnd: "12.5",
            balanceTnd: "112.5",
            href: "/caisse/ventes/10",
          },
          {
            id: "2",
            at: "2026-09-15T08:00:00.000Z",
            reference: "RG-1",
            label: "Règlement",
            creditTnd: "50",
            balanceTnd: "62.5",
          },
        ]}
        hasMore
        onLoadMore={() => undefined}
      />,
    );

    expect(screen.getByText("Du 01/09/2026 au 22/09/2026")).toBeInTheDocument();
    expect(
      screen.getByText("Solde = ventes à crédit − règlements"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Relevé client" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "VT-000010" })).toHaveAttribute(
      "href",
      "/caisse/ventes/10",
    );
    expect(screen.getAllByText(/62,500/)).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Afficher la suite" }),
    ).toBeInTheDocument();
  });
});
