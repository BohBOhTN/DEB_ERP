import { Boxes, Coins, TrendingUp, Wallet, Wheat } from "lucide-react";
import { BarChart } from "../../../components/patterns/BarChart/BarChart.js";
import { KpiGrid } from "../../../components/patterns/KpiGrid/KpiGrid.js";
import { KpiTile } from "../../../components/patterns/KpiTile/KpiTile.js";
import { TrendChart } from "../../../components/patterns/TrendChart/TrendChart.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState.js";
import { formatMoney } from "../../../i18n/format.js";
import { plural } from "../../../i18n/fr.js";
import type { AnalyticsOverview, AnalyticsQuery } from "../analytics.api.js";
import { useAnalyticsOverview } from "../analytics.queries.js";
import {
  bucketLabels,
  moneyWithShare,
  periodDelta,
  shareOf,
} from "../analyticsFormat.js";
import { AnalysisState } from "../AnalysisState.js";
import styles from "../Analytics.module.css";

/// `Vue d'ensemble`: what the period earned, cost and bought against the
/// period just before, how the revenue moved, and where it came from.
export function OverviewTab({ query }: { query: AnalyticsQuery }) {
  return (
    <AnalysisState query={useAnalyticsOverview(query)}>
      {(overview) => (
        <>
          <OverviewKpis overview={overview} />
          {isQuiet(overview) ? (
            <EmptyState
              illustration="ledger"
              title="Aucune activité sur cette période"
              description="Aucune vente, dépense ni achat validé entre ces dates. Choisissez une période plus longue."
            />
          ) : (
            <>
              <TrendCard overview={overview} />
              <div className={styles.two}>
                <ChannelsCard overview={overview} />
                <ExpensesCard overview={overview} />
              </div>
            </>
          )}
        </>
      )}
    </AnalysisState>
  );
}

function isQuiet(overview: AnalyticsOverview): boolean {
  return (
    Number(overview.revenue.totalTnd) === 0 &&
    overview.sales.count === 0 &&
    Number(overview.expenses?.totalTnd ?? 0) === 0 &&
    Number(overview.purchases?.rawMaterialsTnd ?? 0) === 0 &&
    Number(overview.purchases?.resaleTnd ?? 0) === 0
  );
}

/// Issue 022: the five figures the owner asked for, each against the
/// period before. The number of sales sits under the revenue; a tile whose
/// block the caller may not see is absent.
function OverviewKpis({ overview }: { overview: AnalyticsOverview }) {
  const { revenue, sales, charges, margin, purchases, period } = overview;
  // A cost going up is not good news; the arrow still says which way.
  const cost = (current: string, previous: string) => ({
    ...periodDelta(current, previous),
    positiveIsGood: false,
  });
  const tiles = [
    <KpiTile
      key="revenue"
      featured
      label="Chiffre d'affaires"
      value={formatMoney(revenue.totalTnd, { unit: false })}
      unit="TND"
      icon={<TrendingUp />}
      delta={periodDelta(revenue.totalTnd, revenue.previousTotalTnd)}
      note={`${plural(sales.count, "vente")} en caisse · ${plural(period.days, "jour")}`}
    />,
  ];

  if (charges) {
    tiles.push(
      <KpiTile
        key="charges"
        label="Total charges"
        value={formatMoney(charges.totalTnd, { unit: false })}
        unit="TND"
        icon={<Coins />}
        delta={cost(charges.totalTnd, charges.previousTotalTnd)}
        note={`Dépenses ${formatMoney(charges.expensesTnd)} · matières premières ${formatMoney(charges.rawMaterialsTnd)}`}
      />,
    );
  }

  if (margin) {
    const covered = shareOf(
      margin.current.costedRevenueTnd,
      margin.current.revenueTnd,
    );

    tiles.push(
      <KpiTile
        key="margin"
        label="Marge approximative"
        value={formatMoney(margin.current.marginTnd, { unit: false })}
        unit="TND"
        icon={<Wallet />}
        delta={periodDelta(margin.current.marginTnd, margin.previous.marginTnd)}
        note={`ingrédients seulement · sur ${covered} % des ventes en caisse`}
      />,
    );
  }

  if (purchases) {
    tiles.push(
      <KpiTile
        key="raw-materials"
        label="Achats matières premières"
        value={formatMoney(purchases.rawMaterialsTnd, { unit: false })}
        unit="TND"
        icon={<Wheat />}
        delta={cost(
          purchases.rawMaterialsTnd,
          purchases.previousRawMaterialsTnd,
        )}
        note="achats validés, payés ou non"
      />,
      <KpiTile
        key="resale"
        label="Achats produits de revente"
        value={formatMoney(purchases.resaleTnd, { unit: false })}
        unit="TND"
        icon={<Boxes />}
        delta={cost(purchases.resaleTnd, purchases.previousResaleTnd)}
        note="stock à revendre, hors charges"
      />,
    );
  }

  return <KpiGrid columns={tiles.length === 4 ? 4 : 3}>{tiles}</KpiGrid>;
}

function TrendCard({ overview }: { overview: AnalyticsOverview }) {
  const { period, trend, bestBucket } = overview;
  const daily = period.granularity === "day";
  const best = bestBucket
    ? bucketLabels(bestBucket.bucket, period.granularity).label
    : null;

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Évolution du chiffre d'affaires"
        description={
          daily
            ? `Par jour, comparé aux ${period.days} jours précédents.`
            : "Par mois."
        }
      />
      <div className={styles.cardBody}>
        <TrendChart
          title={
            daily
              ? "Chiffre d'affaires par jour"
              : "Chiffre d'affaires par mois"
          }
          points={trend.map((row) => ({
            ...bucketLabels(row.bucket, period.granularity),
            value: Number(row.revenueTnd),
            formatted: formatMoney(row.revenueTnd),
            comparison:
              row.previousRevenueTnd === null
                ? null
                : Number(row.previousRevenueTnd),
            comparisonFormatted:
              row.previousRevenueTnd === null
                ? undefined
                : formatMoney(row.previousRevenueTnd),
          }))}
          seriesLabel="Période"
          comparisonLabel="Période précédente"
          formatScale={(value) => formatMoney(value)}
        />
        {best && bestBucket ? (
          <p className={styles.note}>
            {daily ? "Meilleur jour : " : "Meilleur mois : "}
            <strong>{best}</strong>
            {`, ${formatMoney(bestBucket.revenueTnd)}.`}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function ChannelsCard({ overview }: { overview: AnalyticsOverview }) {
  const { revenue } = overview;
  const channels = [
    { label: "Comptoir", amount: revenue.counterTnd },
    { label: "Commandes", amount: revenue.ordersTnd },
    { label: "Distributeurs", amount: revenue.distributorsTnd },
  ];

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Canaux de vente"
        description="Part de chaque canal dans le chiffre d'affaires."
      />
      <BarChart
        title="Chiffre d'affaires par canal"
        data={channels.map((channel) => ({
          label: channel.label,
          value: Number(channel.amount),
          formatted: moneyWithShare(channel.amount, revenue.totalTnd),
        }))}
      />
    </Card>
  );
}

const categoriesShown = 6;

function ExpensesCard({ overview }: { overview: AnalyticsOverview }) {
  const { expenses } = overview;

  if (!expenses) {
    return null;
  }

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Dépenses par catégorie"
        description="Dépenses validées de la période."
      />
      {expenses.byCategory.length === 0 ? (
        <EmptyState size="sm" title="Aucune dépense sur cette période" />
      ) : (
        <BarChart
          title="Dépenses par catégorie"
          data={expenses.byCategory
            .slice(0, categoriesShown)
            .map((category) => ({
              label: category.name,
              value: Number(category.totalTnd),
              formatted: moneyWithShare(category.totalTnd, expenses.totalTnd),
            }))}
        />
      )}
    </Card>
  );
}
