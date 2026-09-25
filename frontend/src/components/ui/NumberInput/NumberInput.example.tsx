import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import { FormField } from "../FormField/FormField.js";
import { NumberInput } from "./NumberInput.js";

function Example() {
  const [value, setValue] = useState("12.5");

  return (
    <div style={{ maxWidth: 240 }}>
      <FormField label="Valeur" hint={`Émis : "${value}"`}>
        <NumberInput value={value} onChange={setValue} decimals={2} />
      </FormField>
    </div>
  );
}

export const kit: KitEntry = {
  name: "NumberInput",
  group: "ui",
  description:
    "Saisie décimale : virgule ou point, formatage au blur, chaîne décimale émise.",
  examples: [{ title: "Deux décimales", render: () => <Example /> }],
};
