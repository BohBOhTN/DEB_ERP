import { CalendarClock, Flame, Sun } from "lucide-react";
import { BarChart } from "../../../components/patterns/BarChart/BarChart.js";
import {
  Heatmap,
  type HeatmapCell,
} from "../../../components/patterns/Heatmap/Heatmap.js";
import { KpiGrid } from "../../../components/patterns/KpiGrid/KpiGrid.js";
import { KpiTile } from "../../../components/patterns/KpiTile/KpiTile.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState.js";
import { SegmentedControl } from "../../../components/ui/SegmentedControl/SegmentedControl.js";
import { formatMoney, formatQuantity } from "../../../i18n/format.js";
import { plural } from "../../../i18n/fr.js";
import { useIsPhone } from "../../../lib/hooks/useBreakpoint.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import type {
  AnalyticsQuery,
  FrequencyBlock,
  FrequencyCell,
} from "../analytics.api.js";
import { useAnalyticsFrequency } from "../analytics.queries.js";
import { hourSlot, weekdayName, weekdayShort } from "../analyticsFormat.js";
import { AnalysisState } from "../AnalysisState.js";
import styles from "../Analytics.module.css";

type Source = "sales" | "orders";
type Metric = "count" | "amount";

const defaults = { source: "sales", metric: "count" };
const weekdayNumbers = [1, 2, 3, 4, 5, 6, 7];
/// The hours shown when a period holds nothing: a bakery's day.
const quietDay = { first: 6, last: 20 };
const copy: Record<
  Source,
  { one: string; many: string; none: string; heatmap: string; about: string }
> = {
  sales: {
    one: "vente",
    many: "ventes",
    none: "aucune vente",
    heatmap: "Quand vendez-vous ?",
    about:
      "Ventes validées par jour de la semaine et par heure, à l'heure de Tunis.",
  },
  orders: {
    one: "commande",
    many: "commandes",
    none: "aucune commande",
    heatmap: "Quand les commandes sont-elles à retirer ?",
    about:
      "Commandes non annulées selon le jour et l'heure de retrait demandés.",
  },
};

/// `Fréquence`: when the bakery sells and when orders are due, weekday by
/// hour, with the busiest slot, the strongest weekday and the rush hour.
export function FrequencyTab({ query }: { query: AnalyticsQuery }) {
  const [state, setState] = useUrlState(defaults);
  const metric: Metric = state.metric === "amount" ? "amount" : "count";

  return (
    <AnalysisState query={useAnalyticsFrequency(query)}>
      {(frequency) => {
        const source: Source =
          state.source === "orders" && frequency.orders ? "orders" : "sales";
        const block = source === "orders" ? frequency.orders : frequency.sales;

        return (
          <>
            <div className={styles.controls}>
              {frequency.orders ? (
                <SegmentedControl<Source>
                  label="Activité analysée"
                  size="sm"
                  value={source}
                  onValueChange={(next) => setState({ source: next })}
                  options={[
                    { value: "sales", label: "Ventes" },
                    { value: "orders", label: "Retraits de commandes" },
                  ]}
                />
              ) : null}
              <SegmentedControl<Metric>
                label="Mesure"
                size="sm"
                value={metric}
                onValueChange={(next) => setState({ metric: next })}
                options={[
                  { value: "count", label: "Nombre" },
                  { value: "amount", label: "Montant" },
                ]}
              />
            </div>
            {!block || block.count === 0 ? (
              <EmptyState
                illustration="basket"
                title={
                  source === "orders"
                    ? "Aucune commande sur cette période"
                    : "Aucune vente sur cette période"
                }
                description="Choisissez une période plus longue pour voir les créneaux se dessiner."
              />
            ) : (
              <FrequencyBody block={block} source={source} metric={metric} />
            )}
          </>
        );
      }}
    </AnalysisState>
  );
}

function FrequencyBody({
  block,
  source,
  metric,
}: {
  block: FrequencyBlock;
  source: Source;
  metric: Metric;
}) {
  const isPhone = useIsPhone();
  const words = copy[source];
  const count = (value: number) => plural(value, words.one, words.many);
  const measure = (cell: { count: number; totalTnd: string }) =>
    metric === "count" ? cell.count : Number(cell.totalTnd);
  const hours = hoursShown(block.cells);
  const weekdayLabels = weekdayNumbers.map((weekday) =>
    isPhone ? weekdayShort(weekday).slice(0, 1) : weekdayShort(weekday),
  );
  const hourLabels = hours.map((hour) => `${hour} h`);
  const cellLabel = (cell: FrequencyCell) =>
    `${weekdayName(cell.weekday)}, ${hourSlot(cell.hour)} : ${count(cell.count)} · ${formatMoney(cell.totalTnd)}`;
  // A phone is narrow and tall: hours run down, weekdays across.
  const position = (weekday: number, hour: number) =>
    isPhone
      ? { row: hours.indexOf(hour), column: weekday - 1 }
      : { row: weekday - 1, column: hours.indexOf(hour) };
  const cells: HeatmapCell[] = block.cells.map((cell) => ({
    ...position(cell.weekday, cell.hour),
    value: measure(cell),
    label: cellLabel(cell),
  }));
  const strongest = [...block.weekdays].sort(
    (left, right) =>
      right.averageCount - left.averageCount ||
      Number(right.averageTnd) - Number(left.averageTnd),
  )[0];
  const rush = [...block.hours].sort(
    (left, right) => right.count - left.count,
  )[0];

  return (
    <>
      <KpiGrid columns={3}>
        {block.peak ? (
          <KpiTile
            featured
            label="Créneau le plus actif"
            value={`${weekdayName(block.peak.weekday)} ${block.peak.hour} h`}
            icon={<Flame />}
            note={`${count(block.peak.count)} · ${formatMoney(block.peak.totalTnd)}`}
          />
        ) : null}
        {strongest ? (
          <KpiTile
            label="Jour le plus fort"
            value={weekdayName(strongest.weekday)}
            icon={<CalendarClock />}
            note={`en moyenne ${formatQuantity(strongest.averageCount, undefined, 1)} ${words.many} et ${formatMoney(strongest.averageTnd)} par jour`}
          />
        ) : null}
        {rush ? (
          <KpiTile
            label="Heure de pointe"
            value={hourSlot(rush.hour)}
            icon={<Sun />}
            note={`${count(rush.count)} sur la période`}
          />
        ) : null}
      </KpiGrid>
      <Card>
        <CardHeader as="h2" title={words.heatmap} description={words.about} />
        <Heatmap
          title={words.heatmap}
          rows={isPhone ? hourLabels : weekdayLabels}
          columns={isPhone ? weekdayLabels : hourLabels}
          cells={cells}
          emptyLabel={(row, column) => {
            const weekday = isPhone ? column + 1 : row + 1;
            const hour = hours[isPhone ? row : column] ?? 0;

            return `${weekdayName(weekday)}, ${hourSlot(hour)} : ${words.none}`;
          }}
          caption={`Plus la case est foncée, plus le créneau compte de ${metric === "count" ? words.many : "chiffre d'affaires"}.`}
        />
      </Card>
      <div className={styles.two}>
        <Card>
          <CardHeader
            as="h2"
            title="Par jour de la semaine"
            description="Moyenne par jour : un mois compte quatre ou cinq lundis."
          />
          <BarChart
            orientation="vertical"
            height={180}
            title="Moyenne par jour de la semaine"
            data={block.weekdays.map((day) => ({
              label: weekdayShort(day.weekday),
              value:
                metric === "count" ? day.averageCount : Number(day.averageTnd),
              formatted: `en moyenne ${formatQuantity(day.averageCount, undefined, 1)} ${words.many}, ${formatMoney(day.averageTnd)}`,
            }))}
          />
        </Card>
        <Card>
          <CardHeader
            as="h2"
            title="Par heure"
            description={`Heure de début, de ${hours[0]} h à ${hours.at(-1)} h.`}
          />
          <BarChart
            orientation="vertical"
            height={180}
            title="Total par heure"
            data={hours.map((hour) => {
              const row = block.hours[hour] ?? {
                hour,
                count: 0,
                totalTnd: "0.000",
              };

              return {
                label: `${hour}h`,
                value: measure(row),
                formatted: `${count(row.count)}, ${formatMoney(row.totalTnd)}`,
              };
            })}
          />
        </Card>
      </div>
    </>
  );
}

/// The hours worth a column: from one hour before the first activity to one
/// hour after the last.
export function hoursShown(cells: FrequencyCell[]): number[] {
  const active = cells.map((cell) => cell.hour);
  const first =
    active.length === 0 ? quietDay.first : Math.max(0, Math.min(...active) - 1);
  const last =
    active.length === 0 ? quietDay.last : Math.min(23, Math.max(...active) + 1);

  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}
