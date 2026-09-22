import { useState } from "react";
import type { KitEntry } from "../../kit/types.js";
import { SegmentedControl } from "../../ui/SegmentedControl/SegmentedControl.js";
import { Select } from "../../ui/Select/Select.js";
import { FilterBar } from "./FilterBar.js";

function Example() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [period, setPeriod] = useState("today");
  const activeCount = (status ? 1 : 0) + (period !== "today" ? 1 : 0);

  return (
    <FilterBar
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Rechercher un achat"
      activeCount={activeCount}
      onReset={() => {
        setStatus(null);
        setPeriod("today");
      }}
      filters={
        <>
          <Select
            aria-label="Statut"
            placeholder="Statut"
            clearable
            value={status}
            onValueChange={setStatus}
            options={[
              { value: "DRAFT", label: "Brouillon" },
              { value: "POSTED", label: "Validé" },
              { value: "CANCELLED", label: "Annulé" },
            ]}
          />
          <SegmentedControl
            label="Période"
            size="sm"
            value={period}
            onValueChange={setPeriod}
            options={[
              { value: "today", label: "Aujourd'hui" },
              { value: "week", label: "7 jours" },
              { value: "month", label: "Ce mois" },
            ]}
          />
        </>
      }
    />
  );
}

export const kit: KitEntry = {
  name: "FilterBar",
  group: "patterns",
  description:
    "Recherche (300 ms) et filtres ; feuille « Filtres » avec compteur sur téléphone.",
  examples: [{ title: "Achats", render: () => <Example /> }],
};
