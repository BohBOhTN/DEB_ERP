import type { KitEntry } from "../../kit/types.js";
import { BarChart } from "./BarChart.js";

const categories = [
  { label: "Pains", value: 820, formatted: "820,000 TND" },
  { label: "Pâtisserie", value: 430, formatted: "430,000 TND" },
  { label: "Viennoiserie", value: 310, formatted: "310,000 TND" },
  { label: "Gâteaux", value: 150, formatted: "150,000 TND" },
];

const days = ["L", "M", "M", "J", "V", "S", "D"].map((label, index) => ({
  label,
  value: [620, 740, 510, 890, 1020, 1380, 960][index] ?? 0,
  formatted: `${[620, 740, 510, 890, 1020, 1380, 960][index]},000 TND`,
}));

export const kit: KitEntry = {
  name: "BarChart",
  group: "patterns",
  description:
    "Barres horizontales (top catégories) ou verticales (série), accessibles, jetons seulement.",
  examples: [
    {
      title: "Horizontal",
      render: () => <BarChart title="Ventes par catégorie" data={categories} />,
    },
    {
      title: "Vertical",
      render: () => (
        <BarChart title="Ventes par jour" data={days} orientation="vertical" />
      ),
    },
  ],
};
