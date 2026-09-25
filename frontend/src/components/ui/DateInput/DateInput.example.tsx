import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import { FormField } from "../FormField/FormField.js";
import { DateInput } from "./DateInput.js";

function Example() {
  const [value, setValue] = useState("2026-09-22");

  return (
    <div style={{ maxWidth: 240 }}>
      <FormField label="Date d'achat" hint={`Valeur : ${value}`}>
        <DateInput value={value} onChange={setValue} />
      </FormField>
    </div>
  );
}

export const kit: KitEntry = {
  name: "DateInput",
  group: "ui",
  description:
    "Sélecteur de date natif ; valeur ISO, affichage selon la locale.",
  examples: [{ title: "Date", render: () => <Example /> }],
};
