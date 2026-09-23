import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import { AllocationTable, type AllocationRow } from "./AllocationTable.js";

function Demo() {
  const [rows, setRows] = useState<AllocationRow[]>([
    {
      id: "purchase-1",
      label: "AC-000012",
      meta: "échéance 01/09/2026",
      balanceTnd: "200",
      amountTnd: "200",
      overdue: true,
    },
    {
      id: "purchase-2",
      label: "AC-000015",
      meta: "échéance 15/10/2026",
      balanceTnd: "100",
      amountTnd: "",
    },
  ]);

  return <AllocationTable amountTnd="300" rows={rows} onChange={setRows} />;
}

export const kit: KitEntry = {
  name: "AllocationTable",
  group: "patterns",
  description:
    "Affectation d'un paiement aux documents ouverts, avec le reste dû par ligne et le reste non alloué.",
  examples: [
    { title: "Paiement fournisseur de 300 TND", render: () => <Demo /> },
    {
      title: "Aucun document ouvert",
      render: () => (
        <AllocationTable amountTnd="50" rows={[]} onChange={() => undefined} />
      ),
    },
  ],
};
