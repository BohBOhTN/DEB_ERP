import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import { FormField } from "../FormField/FormField.js";
import { Select } from "./Select.js";

const options = [
  { value: "bread", label: "Pains" },
  { value: "pastry", label: "Pâtisserie" },
  { value: "viennoiserie", label: "Viennoiserie" },
  { value: "archived", label: "Archivée", disabled: true },
];

function Example({
  clearable = false,
  invalid = false,
}: {
  clearable?: boolean;
  invalid?: boolean;
}) {
  const [value, setValue] = useState<string | null>(clearable ? "bread" : null);

  return (
    <div style={{ maxWidth: 300 }}>
      <FormField
        label="Catégorie"
        error={invalid ? "Choisissez une catégorie." : undefined}
      >
        <Select
          options={options}
          value={value}
          onValueChange={setValue}
          clearable={clearable}
        />
      </FormField>
    </div>
  );
}

export const kit: KitEntry = {
  name: "Select",
  group: "ui",
  description: "Liste déroulante Radix, déclencheur 44 px, effaçable.",
  examples: [
    { title: "Avec espace réservé", render: () => <Example /> },
    { title: "Effaçable", render: () => <Example clearable /> },
    { title: "Invalide", render: () => <Example invalid /> },
  ],
};
