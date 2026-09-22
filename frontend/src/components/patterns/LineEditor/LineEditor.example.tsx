import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import type { ComboboxOption } from "../../ui/Combobox/Combobox.js";
import { formatMoney } from "../../../i18n/format.js";
import {
  LineEditor,
  linesTotal,
  newLine,
  type EditorLine,
} from "./LineEditor.js";

const catalogue: ComboboxOption[] = [
  { value: "rm1", label: "Farine T55", description: "kg" },
  { value: "rm2", label: "Sucre", description: "kg" },
  { value: "rm3", label: "Levure", description: "g" },
];

function Example() {
  const [lines, setLines] = useState<EditorLine[]>([
    {
      ...newLine(),
      item: catalogue[0] ?? null,
      quantity: "50",
      unitId: "kg",
      unitPriceTnd: "2.5",
    },
    {
      ...newLine(),
      item: catalogue[1] ?? null,
      quantity: "10",
      unitId: "kg",
      unitPriceTnd: "3.1",
    },
  ]);

  return (
    <LineEditor
      lines={lines}
      onChange={setLines}
      itemLabel="Matière première"
      loadItems={async (query) =>
        catalogue.filter((item) =>
          item.label.toLowerCase().includes(query.toLowerCase()),
        )
      }
      unitsFor={() => [
        { value: "kg", label: "kg" },
        { value: "g", label: "g" },
        { value: "sac25", label: "sac de 25 kg" },
      ]}
      footer={
        <strong className="tabular-nums">
          Total {formatMoney(linesTotal(lines))}
        </strong>
      }
    />
  );
}

export const kit: KitEntry = {
  name: "LineEditor",
  group: "patterns",
  description:
    "Lignes article / quantité / unité / prix / total ; cartes sur téléphone, grille sur ordinateur.",
  examples: [{ title: "Achat", render: () => <Example /> }],
};
