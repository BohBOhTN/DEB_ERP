import { HandCoins, PackageCheck, Truck, Undo2 } from "lucide-react";
import { Link } from "react-router-dom";
import { BarChart } from "../../../components/patterns/BarChart/BarChart.js";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { KpiGrid } from "../../../components/patterns/KpiGrid/KpiGrid.js";
import { KpiTile } from "../../../components/patterns/KpiTile/KpiTile.js";
import { TrendChart } from "../../../components/patterns/TrendChart/TrendChart.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState.js";
import {
  formatDate,
  formatMoney,
  formatQuantity,
} from "../../../i18n/format.js";
import { plural } from "../../../i18n/fr.js";
import type {
  AnalyticsDistributors,
  AnalyticsQuery,
  DistributorAnalysis,
  DistributorProductAnalysis,
} from "../analytics.api.js";
import { useAnalyticsDistributors } from "../analytics.queries.js";
import {
  bucketLabels,
  moneyWithShare,
  periodDelta,
  shareOf,
} from "../analyticsFormat.js";
import { AnalysisState } from "../AnalysisState.js";
import styles from "../Analytics.module.css";

const distributorsShown = 8;

const rate = (percent: number | null) =>
  percent === null ? "—" : `${percent} %`;

/// `Distributeurs` (issue 021): what the channel brings, who sells, what
/// comes back from consignment and who owes. Its revenue is the direct
/// sales plus the consignment settlements of the period.
export function DistributorsTab({ query }: { query: AnalyticsQuery }) {
  return (
    <AnalysisState query={useAnalyticsDistributors(query)}>
      {(analysis) => (
        <>
          <ChannelKpis analysis={analysis} />
          {analysis.totals.documentsCount === 0 ? (
            <EmptyState
              illustration="ledger"
              title="Aucune vente distributeur sur cette période"
              description="Ni vente directe ni règlement de dépôt-vente entre ces dates. Choisissez une période plus longue."
            />
          ) : (
            <>
              <TrendCard analysis={analysis} />
              <RankingCard analysis={analysis} />
              <DistributorsCard analysis={analysis} />
              <ProductsCard analysis={analysis} />
            </>
          )}
        </>
      )}
    </AnalysisState>
  );
}

function ChannelKpis({ analysis }: { analysis: AnalyticsDistributors }) {
  const { totals } = analysis;

  return (
    <KpiGrid columns={4}>
      <KpiTile
        featured
        label="Chiffre d'affaires distributeurs"
        value={formatMoney(totals.revenueTnd, { unit: false })}
        unit="TND"
        icon={<Truck />}
        delta={periodDelta(totals.revenueTnd, totals.previousRevenueTnd)}
        note={`${plural(totals.documentsCount, "document")} · ${plural(totals.activeCount, "distributeur actif", "distributeurs actifs")}`}
      />
      <KpiTile
        label="Ventes directes"
        value={formatMoney(totals.directTnd, { unit: false })}
        unit="TND"
        icon={<PackageCheck />}
        note={`${shareOf(totals.directTnd, totals.revenueTnd)} % du canal`}
      />
      <KpiTile
        label="Dépôt-vente réglé"
        value={formatMoney(totals.consignmentTnd, { unit: false })}
        unit="TND"
        icon={<Undo2 />}
        note={
          totals.returnRatePercent === null
            ? `${shareOf(totals.consignmentTnd, totals.revenueTnd)} % du canal`
            : `${shareOf(totals.consignmentTnd, totals.revenueTnd)} % du canal · ${totals.returnRatePercent} % de retours`
        }
      />
      {totals.balanceTnd !== null ? (
        <KpiTile
          label="Reste à encaisser"
          value={formatMoney(totals.balanceTnd, { unit: false })}
          unit="TND"
          icon={<HandCoins />}
          note="solde actuel de tous les distributeurs"
          href="/distributeurs"
        />
      ) : (
        <KpiTile
          label="Taux de retour"
          value={rate(totals.returnRatePercent)}
          icon={<Undo2 />}
          note="sur le dépôt-vente réglé"
        />
      )}
    </KpiGrid>
  );
}

function TrendCard({ analysis }: { analysis: AnalyticsDistributors }) {
  const { period, trend } = analysis;
  const daily = period.granularity === "day";

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Évolution du canal"
        description={
          daily
            ? "Par jour, ventes directes et dépôt-vente réglé."
            : "Par mois, ventes directes et dépôt-vente réglé."
        }
      />
      <div className={styles.cardBody}>
        <TrendChart
          title={
            daily
              ? "Chiffre d'affaires distributeurs par jour"
              : "Chiffre d'affaires distributeurs par mois"
          }
          points={trend.map((row) => ({
            ...bucketLabels(row.bucket, period.granularity),
            value: Number(row.directTnd),
            formatted: formatMoney(row.directTnd),
            comparison: Number(row.consignmentTnd),
            comparisonFormatted: formatMoney(row.consignmentTnd),
          }))}
          seriesLabel="Ventes directes"
          comparisonLabel="Dépôt-vente"
          formatScale={(value) => formatMoney(value)}
        />
      </div>
    </Card>
  );
}

function RankingCard({ analysis }: { analysis: AnalyticsDistributors }) {
  const { distributors, totals } = analysis;

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Chiffre d'affaires par distributeur"
        description="Ce que chaque distributeur représente dans le canal."
      />
      <BarChart
        title="Chiffre d'affaires par distributeur"
        data={distributors.slice(0, distributorsShown).map((row) => ({
          label: row.name,
          value: Number(row.revenueTnd),
          formatted: moneyWithShare(row.revenueTnd, totals.revenueTnd),
        }))}
      />
    </Card>
  );
}

function DistributorsCard({ analysis }: { analysis: AnalyticsDistributors }) {
  const rows = analysis.distributors;
  const withBalances = rows.some((row) => row.balanceTnd !== null);
  const columns: DataTableColumn<DistributorAnalysis>[] = [
    {
      id: "name",
      header: "Distributeur",
      cell: ({ row }) => (
        <Link to={`/distributeurs/${row.original.distributorId}`}>
          {row.original.name}
        </Link>
      ),
    },
    {
      id: "revenue",
      header: "Chiffre d'affaires",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.revenueTnd),
    },
    {
      id: "direct",
      header: "Ventes directes",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.directTnd),
    },
    {
      id: "consignment",
      header: "Dépôt-vente",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.consignmentTnd),
    },
    {
      id: "documents",
      header: "Documents",
      meta: { align: "right" },
      accessorFn: (row) => row.documentsCount,
    },
    {
      id: "returns",
      header: "Taux de retour",
      meta: { align: "right" },
      accessorFn: (row) => rate(row.returnRatePercent),
    },
    {
      id: "last",
      header: "Dernière activité",
      accessorFn: (row) =>
        row.lastActivityAt ? formatDate(row.lastActivityAt) : "—",
    },
    ...(withBalances
      ? [
          {
            id: "balance",
            header: "Solde actuel",
            meta: { align: "right" as const },
            accessorFn: (row: DistributorAnalysis) =>
              row.balanceTnd === null ? "—" : formatMoney(row.balanceTnd),
          },
        ]
      : []),
  ];

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Détail par distributeur"
        description="Le taux de retour est ce qui est revenu sur tout le dépôt-vente réglé dans la période."
      />
      <DataTable<DistributorAnalysis>
        label="Détail par distributeur"
        columns={columns}
        data={rows}
        total={rows.length}
        page={1}
        pageSize={Math.max(rows.length, 1)}
        onChange={() => undefined}
        getRowId={(row) => row.distributorId}
        mobileCard={(row) => (
          <>
            <span className={styles.cardTop}>
              <strong>{row.name}</strong>
              <span className="tabular-nums">
                {formatMoney(row.revenueTnd)}
              </span>
            </span>
            <span className={styles.muted}>
              {`Directes ${formatMoney(row.directTnd)} · dépôt-vente ${formatMoney(row.consignmentTnd)}`}
            </span>
            <span className={styles.muted}>
              {`${plural(row.documentsCount, "document")} · retours ${rate(row.returnRatePercent)}${row.balanceTnd === null ? "" : ` · solde ${formatMoney(row.balanceTnd)}`}`}
            </span>
          </>
        )}
      />
    </Card>
  );
}

function ProductsCard({ analysis }: { analysis: AnalyticsDistributors }) {
  const rows = analysis.products;
  const withMargin = rows.some((row) => row.marginTnd !== null);
  const columns: DataTableColumn<DistributorProductAnalysis>[] = [
    {
      id: "name",
      header: "Produit",
      cell: ({ row }) => (
        <Link to={`/produits/${row.original.productId}`}>
          {row.original.name}
        </Link>
      ),
    },
    {
      id: "quantity",
      header: "Quantité vendue",
      meta: { align: "right" },
      accessorFn: (row) => formatQuantity(row.quantity, row.unitName),
    },
    {
      id: "revenue",
      header: "Chiffre d'affaires",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.revenueTnd),
    },
    {
      id: "returned",
      header: "Retours",
      meta: { align: "right" },
      accessorFn: (row) => formatQuantity(row.returnedQuantity, row.unitName),
    },
    {
      id: "rate",
      header: "Taux de retour",
      meta: { align: "right" },
      accessorFn: (row) => rate(row.returnRatePercent),
    },
    ...(withMargin
      ? [
          {
            id: "margin",
            header: "Marge approx.",
            meta: { align: "right" as const },
            accessorFn: (row: DistributorProductAnalysis) =>
              row.marginTnd === null ? "—" : formatMoney(row.marginTnd),
          },
        ]
      : []),
  ];

  if (rows.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Produits vendus par les distributeurs"
        description="Ventes directes et dépôt-vente réglé ; les retours viennent du dépôt-vente."
      />
      <DataTable<DistributorProductAnalysis>
        label="Produits vendus par les distributeurs"
        columns={columns}
        data={rows}
        total={rows.length}
        page={1}
        pageSize={Math.max(rows.length, 1)}
        onChange={() => undefined}
        getRowId={(row) => row.productId}
        mobileCard={(row) => (
          <>
            <span className={styles.cardTop}>
              <strong>{row.name}</strong>
              <span className="tabular-nums">
                {formatMoney(row.revenueTnd)}
              </span>
            </span>
            <span className={styles.muted}>
              {`${formatQuantity(row.quantity, row.unitName)} · retours ${formatQuantity(row.returnedQuantity, row.unitName)} (${rate(row.returnRatePercent)})`}
            </span>
          </>
        )}
      />
    </Card>
  );
}
