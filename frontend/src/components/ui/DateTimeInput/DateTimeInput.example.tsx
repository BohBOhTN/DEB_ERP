import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import { FormField } from "../FormField/FormField.js";
import { DateTimeInput } from "./DateTimeInput.js";

function Example() {
  const [value, setValue] = useState("2026-09-22T14:30");

  return (
    <div style={{ maxWidth: 280 }}>
      <FormField label="Livraison souhaitée">
        <DateTimeInput value={value} onChange={setValue} />
      </FormField>
    </div>
  );
}

export const kit: KitEntry = {
  name: "DateTimeInput",
  group: "ui",
  description:
    "Date et heure natives ; valeur locale convertie en instant ISO.",
  examples: [{ title: "Date et heure", render: () => <Example /> }],
};
