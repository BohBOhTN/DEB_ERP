import type { KitEntry } from "../../kit/types.js";
import { RadioGroup } from "./RadioGroup.js";

export const kit: KitEntry = {
  name: "RadioGroup",
  group: "ui",
  description:
    "Choix exclusif, vertical ou horizontal, avec description par option.",
  examples: [
    {
      title: "Vertical",
      render: () => (
        <RadioGroup
          label="Sort de l'acompte"
          defaultValue="REFUND"
          options={[
            {
              value: "REFUND",
              label: "Rembourser l'acompte",
              description: "Sortie de caisse immédiate.",
            },
            {
              value: "CREDIT",
              label: "Conserver en avoir",
              description: "Reste disponible pour le client.",
            },
            { value: "NONE", label: "Option désactivée", disabled: true },
          ]}
        />
      ),
    },
    {
      title: "Horizontal",
      render: () => (
        <RadioGroup
          label="Type"
          orientation="horizontal"
          defaultValue="direct"
          options={[
            { value: "direct", label: "Vente directe" },
            { value: "order", label: "Commande" },
          ]}
        />
      ),
    },
  ],
};
