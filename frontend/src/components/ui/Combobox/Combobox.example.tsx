import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import { FormField } from "../FormField/FormField.js";
import { Combobox, type ComboboxOption } from "./Combobox.js";

const catalogue: ComboboxOption[] = [
  { value: "p1", label: "Pain complet", description: "1,200 TND" },
  { value: "p2", label: "Baguette", description: "0,350 TND" },
  { value: "p3", label: "Thé à la menthe", description: "2,500 TND" },
  { value: "p4", label: "Croissant", description: "1,000 TND" },
];

async function loadOptions(query: string) {
  await new Promise((resolve) => setTimeout(resolve, 300));

  return catalogue.filter((option) =>
    option.label.toLowerCase().includes(query.toLowerCase()),
  );
}

function Example() {
  const [value, setValue] = useState<ComboboxOption | null>(null);

  return (
    <div style={{ maxWidth: 320 }}>
      <FormField label="Produit">
        <Combobox
          loadOptions={loadOptions}
          value={value}
          onChange={setValue}
          placeholder="Rechercher un produit"
          createLabel="Créer le produit"
          onCreate={() => undefined}
        />
      </FormField>
    </div>
  );
}

export const kit: KitEntry = {
  name: "Combobox",
  group: "ui",
  description:
    "Recherche asynchrone (250 ms), navigation clavier, « Aucun résultat », création.",
  examples: [{ title: "Produit", render: () => <Example /> }],
};
