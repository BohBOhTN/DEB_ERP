import type { KitEntry } from "../../kit/types.js";
import { StatusPill } from "../../ui/StatusPill/StatusPill.js";
import { KeyValueList } from "./KeyValueList.js";

export const kit: KitEntry = {
  name: "KeyValueList",
  group: "patterns",
  description:
    "Paires libellé/valeur, deux colonnes sur ordinateur, empilées sur téléphone.",
  examples: [
    {
      title: "Fiche client",
      render: () => (
        <KeyValueList
          items={[
            { label: "Nom", value: "Salma Ben Ali" },
            { label: "Téléphone", value: "22 333 444" },
            { label: "Solde dû", value: "125,000 TND", numeric: true },
            { label: "Avance", value: "0,000 TND", numeric: true },
            {
              label: "Statut",
              value: <StatusPill status="ACTIVE" label="Active" />,
            },
            { label: "Notes", value: null },
          ]}
        />
      ),
    },
  ],
};
