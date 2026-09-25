import type { KitEntry } from "../../kit/types.js";
import { StatementTable } from "./StatementTable.js";

export const kit: KitEntry = {
  name: "StatementTable",
  group: "patterns",
  description:
    "Relevé avec solde d'ouverture, écritures, solde courant, période et base de calcul.",
  examples: [
    {
      title: "Relevé client",
      render: () => (
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
              href: "#",
            },
            {
              id: "2",
              at: "2026-09-15T08:00:00.000Z",
              reference: "RG-000004",
              label: "Règlement client",
              creditTnd: "50",
              balanceTnd: "62.5",
            },
          ]}
          hasMore
          onLoadMore={() => undefined}
        />
      ),
    },
    {
      title: "Chargement",
      render: () => (
        <StatementTable
          label="Relevé"
          rangeLabel="…"
          basisLabel="…"
          openingBalanceTnd="0"
          closingBalanceTnd="0"
          entries={[]}
          loading
        />
      ),
    },
  ],
};
