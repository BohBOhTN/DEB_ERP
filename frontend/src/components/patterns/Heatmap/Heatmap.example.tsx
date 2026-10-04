import type { KitEntry } from "../../kit/types.js";
import { Heatmap, type HeatmapCell } from "./Heatmap.js";

const days = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];
const hours = Array.from({ length: 14 }, (_, index) => index + 6);
const cells: HeatmapCell[] = days.flatMap((day, row) =>
  hours.flatMap((hour, column) => {
    // A morning rush, a smaller one before dinner, more on the week-end.
    const rush = Math.max(0, 9 - Math.abs(hour - 8) * 3);
    const evening = Math.max(0, 5 - Math.abs(hour - 17) * 2);
    const value = Math.round((rush + evening) * (row >= 5 ? 1.6 : 1));

    return value === 0
      ? []
      : [
          {
            row,
            column,
            value,
            label: `${day}, ${hour} h à ${hour + 1} h : ${value} ventes`,
          },
        ];
  }),
);

export const kit: KitEntry = {
  name: "Heatmap",
  group: "patterns",
  description:
    "Grille lignes × colonnes dont les cases foncent avec la valeur ; une seule case dans l'ordre de tabulation, flèches pour se déplacer.",
  examples: [
    {
      title: "Ventes par jour et par heure",
      render: () => (
        <Heatmap
          title="Ventes par jour et par heure"
          rows={days.map((day) => day.slice(0, 3))}
          columns={hours.map((hour) => `${hour} h`)}
          cells={cells}
          emptyLabel={(row, column) =>
            `${days[row]}, ${hours[column]} h à ${(hours[column] ?? 0) + 1} h : aucune vente`
          }
          caption="Survolez une case pour lire ses chiffres."
        />
      ),
    },
    {
      title: "Sans donnée",
      render: () => (
        <Heatmap
          title="Aucune vente"
          rows={days.map((day) => day.slice(0, 3))}
          columns={hours.slice(0, 6).map((hour) => `${hour} h`)}
          cells={[]}
          emptyLabel={() => "Aucune vente"}
        />
      ),
    },
  ],
};
