import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import type { PeriodValue } from "../../../lib/dates/periodRange.js";
import { PeriodFilter } from "./PeriodFilter.js";

function Example() {
  const [value, setValue] = useState<PeriodValue>({
    preset: "today",
    from: "",
    to: "",
  });

  return <PeriodFilter value={value} onChange={setValue} />;
}

export const kit: KitEntry = {
  name: "PeriodFilter",
  group: "patterns",
  description:
    "Période d'une liste : aujourd'hui, hier, cette semaine, ce mois ou une date ou un intervalle ; état dans l'URL de la page.",
  examples: [{ title: "Période", render: () => <Example /> }],
};
