import {
  HandCoins,
  Receipt,
  ReceiptText,
  ShoppingBasket,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { BarChart } from "../../../components/patterns/BarChart/BarChart.js";
import { KpiGrid } from "../../../components/patterns/KpiGrid/KpiGrid.js";
import { KpiTile } from "../../../components/patterns/KpiTile/KpiTile.js";
import { TrendChart } from "../../../components/patterns/TrendChart/TrendChart.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState.js";
import { formatInteger, formatMoney } from "../../../i18n/format.js";
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

/// `Vue d'ensemble`: what the period earned and cost against the period
/// just before, how the revenue moved, and where it came from.
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
              description="Aucune vente ni dépense validée entre ces dates. Choisissez une période plus longue."
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
    Number(overview.expenses?.totalTnd ?? 0) === 0
  );
}

function OverviewKpis({ overview }: { overview: AnalyticsOverview }) {
  const { revenue, sales, expenses, margin, period } = overview;
  const tiles = [
    <KpiTile
      key="revenue"
      featured
      label="Chiffre d'affaires"
      value={formatMoney(revenue.totalTnd, { unit: false })}
      unit="TND"
      icon={<TrendingUp />}
      delta={periodDelta(revenue.totalTnd, revenue.previousTotalTnd)}
      note={`${plural(period.days, "jour")} · ventes validées`}
    />,
    <KpiTile
      key="sales"
      label="Ventes en caisse"
      value={formatInteger(sales.count)}
      icon={<Receipt />}
      delta={periodDelta(sales.count, sales.previousCount)}
      note={
        sales.cancelledCount > 0
          ? `hors ${plural(sales.cancelledCount, "vente annulée", "ventes annulées")}`
          : "comptoir et commandes"
      }
    />,
    <KpiTile
      key="basket"
      label="Panier moyen"
      value={
        sales.averageBasketTnd
          ? formatMoney(sales.averageBasketTnd, { unit: false })
          : "—"
      }
      unit={sales.averageBasketTnd ? "TND" : undefined}
      icon={<ShoppingBasket />}
      delta={
        sales.averageBasketTnd && sales.previousAverageBasketTnd
          ? periodDelta(sales.averageBasketTnd, sales.previousAverageBasketTnd)
          : undefined
      }
      note="par vente en caisse"
    />,
  ];

  if (expenses) {
    tiles.push(
      <KpiTile
        key="expenses"
        label="Dépenses"
        value={formatMoney(expenses.totalTnd, { unit: false })}
        unit="TND"
        icon={<ReceiptText />}
        // Spending going up is not good news.
        delta={{
          ...periodDelta(expenses.totalTnd, expenses.previousTotalTnd),
          positiveIsGood: false,
        }}
        note="dépenses validées"
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

  tiles.push(
    <KpiTile
      key="due"
      label="Reste à encaisser"
      value={formatMoney(sales.remainingDueTnd, { unit: false })}
      unit="TND"
      icon={<HandCoins />}
      note="sur les ventes de la période"
    />,
  );

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
