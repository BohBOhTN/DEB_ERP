import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import { FormField } from "../FormField/FormField.js";
import { MoneyInput } from "./MoneyInput.js";

function Example() {
  const [value, setValue] = useState("1250");

  return (
    <div style={{ maxWidth: 240 }}>
      <FormField label="Montant payé" hint={`Émis : "${value}"`}>
        <MoneyInput value={value} onChange={setValue} />
      </FormField>
    </div>
  );
}

export const kit: KitEntry = {
  name: "MoneyInput",
  group: "ui",
  description:
    "Montant TND à trois décimales ; « 12,500 » affiché, « 12.5 » émis.",
  examples: [{ title: "Montant", render: () => <Example /> }],
};
