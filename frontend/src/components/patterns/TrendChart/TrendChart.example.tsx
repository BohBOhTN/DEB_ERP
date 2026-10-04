import type { KitEntry } from "../../kit/types.js";
import { TrendChart, type TrendPoint } from "./TrendChart.js";

const money = (value: number) => `${value},000 TND`;
const revenue = [
  620, 740, 510, 890, 1020, 1380, 960, 640, 780, 560, 910, 1100, 1420, 1010,
];
const before = [
  580, 700, 560, 800, 940, 1250, 900, 600, 720, 590, 850, 990, 1300, 940,
];
const points: TrendPoint[] = revenue.map((value, index) => ({
  label: `${String(index + 1).padStart(2, "0")}/09/2026`,
  tick: `${String(index + 1).padStart(2, "0")}/09`,
  value,
  formatted: money(value),
  comparison: before[index],
  comparisonFormatted: money(before[index] ?? 0),
}));

export const kit: KitEntry = {
  name: "TrendChart",
  group: "patterns",
  description:
    "Courbe d'une série dans le temps avec, en pointillé, la période précédente ; lecture au survol et au clavier.",
  examples: [
    {
      title: "Avec la période précédente",
      render: () => (
        <TrendChart
          title="Chiffre d'affaires par jour"
          points={points}
          seriesLabel="Période"
          comparisonLabel="Période précédente"
          formatScale={money}
        />
      ),
    },
    {
      title: "Série seule",
      render: () => (
        <TrendChart
          title="Chiffre d'affaires par mois"
          points={points.slice(0, 6).map((point) => ({
            ...point,
            comparison: null,
          }))}
          seriesLabel="Chiffre d'affaires"
          formatScale={money}
        />
      ),
    },
  ],
};
