import type { KitEntry } from "../../kit/types.js";
import { Tabs } from "./Tabs.js";

export const kit: KitEntry = {
  name: "Tabs",
  group: "ui",
  description: "Onglets Radix, défilement horizontal sur téléphone.",
  examples: [
    {
      title: "Catégories et unités",
      render: () => (
        <Tabs
          label="Catalogue"
          items={[
            {
              value: "categories",
              label: "Catégories",
              content: <p>Tableau des catégories.</p>,
            },
            {
              value: "units",
              label: "Unités",
              content: <p>Tableau des unités.</p>,
            },
            {
              value: "conversions",
              label: "Conversions",
              content: <p>Conversions entre unités.</p>,
            },
            {
              value: "archived",
              label: "Archivées",
              content: null,
              disabled: true,
            },
          ]}
        />
      ),
    },
  ],
};
