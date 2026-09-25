import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import { FormField } from "../FormField/FormField.js";
import { QuantityInput } from "./QuantityInput.js";

function Example() {
  const [value, setValue] = useState("2.5");

  return (
    <div style={{ maxWidth: 240 }}>
      <FormField label="Quantité">
        <QuantityInput value={value} onChange={setValue} unit="kg" />
      </FormField>
    </div>
  );
}

export const kit: KitEntry = {
  name: "QuantityInput",
  group: "ui",
  description: "Quantité avec suffixe d'unité.",
  examples: [{ title: "Kilogrammes", render: () => <Example /> }],
};
