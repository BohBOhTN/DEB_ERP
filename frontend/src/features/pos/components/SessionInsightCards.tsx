import { Link } from "react-router-dom";
import { BarChart } from "../../../components/patterns/BarChart/BarChart.js";
import { RankedList } from "../../../components/patterns/RankedList/RankedList.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState.js";
import { formatMoney, formatQuantity } from "../../../i18n/format.js";
import { plural } from "../../../i18n/fr.js";
import type { SessionInsights } from "../pos.api.js";
import styles from "../pages/PosPages.module.css";

/// What a session looked like (issue 014): its posted sales hour by hour,
/// in Tunis, and the products that made its revenue.
export function SessionInsightCards({
  insights,
}: {
  insights: SessionInsights;
}) {
  if (insights.hourly.length === 0) {
    return (
      <Card>
        <EmptyState
          size="sm"
          title="Aucune vente sur cette session"
          description="L'activité par heure et les meilleurs produits apparaîtront avec les ventes."
        />
      </Card>
    );
  }

  const first = insights.hourly[0]?.hour ?? 0;
  const last = insights.hourly.at(-1)?.hour ?? first;
  const byHour = new Map(insights.hourly.map((row) => [row.hour, row]));
  // Every hour from the first sale to the last, so a quiet hour shows.
  const hours = Array.from({ length: last - first + 1 }, (_, index) => {
    const hour = first + index;

    return byHour.get(hour) ?? { hour, count: 0, totalTnd: "0.000" };
  });

  return (
    <div className={styles.insights}>
      <Card>
        <CardHeader
          as="h2"
          title="Activité par heure"
          description="Ventes validées de la session, par heure de début."
        />
        <BarChart
          orientation="vertical"
          height={180}
          title="Ventes par heure"
          data={hours.map((row) => ({
            label: `${row.hour}h`,
            value: row.count,
            formatted: `${plural(row.count, "vente")}, ${formatMoney(row.totalTnd)}`,
          }))}
        />
      </Card>
      <Card>
        <CardHeader
          as="h2"
          title="Meilleurs produits"
          description="Ce qui a fait le chiffre d'affaires de la session."
        />
        <RankedList
          title="Meilleurs produits de la session"
          items={insights.topProducts.map((product) => ({
            label: (
              <Link to={`/produits/${product.productId}`}>{product.name}</Link>
            ),
            value: Number(product.revenueTnd),
            formatted: `${formatMoney(product.revenueTnd)} · ${formatQuantity(product.quantity, product.unitName)}`,
          }))}
        />
      </Card>
    </div>
  );
}
