import { Boxes, HandCoins, ShoppingCart, Wheat } from "lucide-react";
import { Link } from "react-router-dom";
import { BarChart } from "../../../components/patterns/BarChart/BarChart.js";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { KpiGrid } from "../../../components/patterns/KpiGrid/KpiGrid.js";
import { KpiTile } from "../../../components/patterns/KpiTile/KpiTile.js";
import { TrendChart } from "../../../components/patterns/TrendChart/TrendChart.js";
import { Badge } from "../../../components/ui/Badge/Badge.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState.js";
import {
  formatDate,
  formatMoney,
  formatQuantity,
} from "../../../i18n/format.js";
import { plural } from "../../../i18n/fr.js";
import type {
  AnalyticsPurchases,
  AnalyticsQuery,
  PurchasedRawMaterial,
  PurchasedResaleProduct,
} from "../analytics.api.js";
import { useAnalyticsPurchases } from "../analytics.queries.js";
import {
  bucketLabels,
  moneyWithShare,
  periodDelta,
  shareOf,
} from "../analyticsFormat.js";
import { AnalysisState } from "../AnalysisState.js";
import styles from "../Analytics.module.css";

const suppliersShown = 8;

/// `Achats` (issue 021): what was bought over the period, in raw materials
/// and in products to resell, from whom and at what price. A purchase
/// counts on its date for its full amount, paid or not.
export function PurchasesTab({ query }: { query: AnalyticsQuery }) {
  return (
    <AnalysisState query={useAnalyticsPurchases(query)}>
      {(purchases) => (
        <>
          <PurchaseKpis purchases={purchases} />
          {purchases.totals.purchasesCount === 0 ? (
            <EmptyState
              illustration="ledger"
              title="Aucun achat sur cette période"
              description="Aucun achat validé entre ces dates. Choisissez une période plus longue."
            />
          ) : (
            <>
              <TrendCard purchases={purchases} />
              <SuppliersCard purchases={purchases} />
              <RawMaterialsCard purchases={purchases} />
              <ResaleProductsCard purchases={purchases} />
            </>
          )}
        </>
      )}
    </AnalysisState>
  );
}

function PurchaseKpis({ purchases }: { purchases: AnalyticsPurchases }) {
  const { totals } = purchases;
  // Buying more is neither good nor bad news by itself; the arrow says
  // which way it went and the tone stays that of a cost.
  const cost = (current: string, previous: string) => ({
    ...periodDelta(current, previous),
    positiveIsGood: false,
  });

  return (
    <KpiGrid columns={4}>
      <KpiTile
        featured
        label="Total des achats"
        value={formatMoney(totals.totalTnd, { unit: false })}
        unit="TND"
        icon={<ShoppingCart />}
        delta={cost(totals.totalTnd, totals.previousTotalTnd)}
        note={plural(totals.purchasesCount, "achat validé", "achats validés")}
      />
      <KpiTile
        label="Matières premières"
        value={formatMoney(totals.rawMaterialsTnd, { unit: false })}
        unit="TND"
        icon={<Wheat />}
        delta={cost(totals.rawMaterialsTnd, totals.previousRawMaterialsTnd)}
        note={`${shareOf(totals.rawMaterialsTnd, totals.totalTnd)} % des achats`}
      />
      <KpiTile
        label="Produits de revente"
        value={formatMoney(totals.resaleTnd, { unit: false })}
        unit="TND"
        icon={<Boxes />}
        delta={cost(totals.resaleTnd, totals.previousResaleTnd)}
        note={`${shareOf(totals.resaleTnd, totals.totalTnd)} % des achats`}
      />
      <KpiTile
        label="Reste à payer"
        value={formatMoney(totals.remainingDueTnd, { unit: false })}
        unit="TND"
        icon={<HandCoins />}
        note="sur les achats de la période"
      />
    </KpiGrid>
  );
}

function TrendCard({ purchases }: { purchases: AnalyticsPurchases }) {
  const { period, trend } = purchases;
  const daily = period.granularity === "day";

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Évolution des achats"
        description={
          daily
            ? "Par jour, matières premières et produits de revente."
            : "Par mois, matières premières et produits de revente."
        }
      />
      <div className={styles.cardBody}>
        <TrendChart
          title={daily ? "Achats par jour" : "Achats par mois"}
          points={trend.map((row) => ({
            ...bucketLabels(row.bucket, period.granularity),
            value: Number(row.rawMaterialsTnd),
            formatted: formatMoney(row.rawMaterialsTnd),
            comparison: Number(row.resaleTnd),
            comparisonFormatted: formatMoney(row.resaleTnd),
          }))}
          seriesLabel="Matières premières"
          comparisonLabel="Produits de revente"
          formatScale={(value) => formatMoney(value)}
        />
      </div>
    </Card>
  );
}

function SuppliersCard({ purchases }: { purchases: AnalyticsPurchases }) {
  const { suppliers, totals } = purchases;

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Achats par fournisseur"
        description="Ce que chaque fournisseur représente dans les achats de la période."
      />
      <BarChart
        title="Achats par fournisseur"
        data={suppliers.slice(0, suppliersShown).map((supplier) => ({
          label: supplier.name,
          value: Number(supplier.totalTnd),
          formatted: `${moneyWithShare(supplier.totalTnd, totals.totalTnd)} · ${plural(supplier.purchasesCount, "achat")}`,
        }))}
      />
    </Card>
  );
}

function priceChange(percent: number) {
  if (percent === 0) {
    return <Badge tone="neutral">Stable</Badge>;
  }

  // A raw material getting dearer is the bad direction.
  return (
    <Badge tone={percent > 0 ? "danger" : "success"}>
      {`${percent > 0 ? "+" : "−"}${Math.abs(percent)} %`}
    </Badge>
  );
}

function RawMaterialsCard({ purchases }: { purchases: AnalyticsPurchases }) {
  const rows = purchases.rawMaterials;
  const columns: DataTableColumn<PurchasedRawMaterial>[] = [
    {
      id: "name",
      header: "Matière première",
      cell: ({ row }) => (
        <Link to={`/matieres-premieres/${row.original.rawMaterialId}`}>
          {row.original.name}
        </Link>
      ),
    },
    {
      id: "quantity",
      header: "Quantité",
      meta: { align: "right" },
      accessorFn: (row) => formatQuantity(row.quantity, row.unitName),
    },
    {
      id: "purchases",
      header: "Achats",
      meta: { align: "right" },
      accessorFn: (row) => row.purchasesCount,
    },
    {
      id: "total",
      header: "Montant",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.totalTnd),
    },
    {
      id: "average",
      header: "Prix moyen",
      meta: { align: "right" },
      accessorFn: (row) =>
        row.averagePriceTnd ? formatMoney(row.averagePriceTnd) : "—",
    },
    {
      id: "last",
      header: "Dernier prix",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.lastPriceTnd),
    },
    {
      id: "change",
      header: "Évolution du prix",
      cell: ({ row }) => priceChange(row.original.priceChangePercent),
    },
    {
      id: "lastAt",
      header: "Dernier achat",
      accessorFn: (row) => formatDate(row.lastPurchasedAt),
    },
  ];

  if (rows.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Matières premières achetées"
        description="Quantités en unité de base ; le prix s'entend par unité de base, entre le premier et le dernier achat de la période."
      />
      <DataTable<PurchasedRawMaterial>
        label="Matières premières achetées"
        columns={columns}
        data={rows}
        total={rows.length}
        page={1}
        pageSize={Math.max(rows.length, 1)}
        onChange={() => undefined}
        getRowId={(row) => row.rawMaterialId}
        mobileCard={(row) => (
          <>
            <span className={styles.cardTop}>
              <strong>{row.name}</strong>
              <span className="tabular-nums">{formatMoney(row.totalTnd)}</span>
            </span>
            <span className={styles.muted}>
              {`${formatQuantity(row.quantity, row.unitName)} · ${plural(row.purchasesCount, "achat")} · dernier prix ${formatMoney(row.lastPriceTnd)}`}
            </span>
            {priceChange(row.priceChangePercent)}
          </>
        )}
      />
    </Card>
  );
}

function ResaleProductsCard({ purchases }: { purchases: AnalyticsPurchases }) {
  const rows = purchases.resaleProducts;
  const withMargin = rows.some((row) => row.unitMarginTnd !== null);
  const columns: DataTableColumn<PurchasedResaleProduct>[] = [
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
      id: "bought",
      header: "Acheté",
      meta: { align: "right" },
      accessorFn: (row) => formatQuantity(row.quantity, row.unitName),
    },
    {
      id: "sold",
      header: "Vendu",
      meta: { align: "right" },
      accessorFn: (row) => formatQuantity(row.soldQuantity, row.unitName),
    },
    {
      id: "total",
      header: "Montant acheté",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.totalTnd),
    },
    {
      id: "revenue",
      header: "Chiffre d'affaires",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.soldRevenueTnd),
    },
    {
      id: "last",
      header: "Dernier prix d'achat",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.lastPriceTnd),
    },
    {
      id: "sale",
      header: "Prix de vente",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.salePriceTnd),
    },
    ...(withMargin
      ? [
          {
            id: "margin",
            header: "Marge unitaire",
            meta: { align: "right" as const },
            accessorFn: (row: PurchasedResaleProduct) =>
              row.unitMarginTnd === null ? "—" : formatMoney(row.unitMarginTnd),
          },
        ]
      : []),
  ];

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Produits de revente achetés"
        description="Ce qui a été acheté pour être revendu, à côté de ce qui s'est vendu sur la même période, tous canaux confondus."
      />
      {rows.length === 0 ? (
        <EmptyState
          size="sm"
          title="Aucun produit de revente acheté sur cette période"
        />
      ) : (
        <DataTable<PurchasedResaleProduct>
          label="Produits de revente achetés"
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
                  {formatMoney(row.totalTnd)}
                </span>
              </span>
              <span className={styles.muted}>
                {`Acheté ${formatQuantity(row.quantity, row.unitName)} · vendu ${formatQuantity(row.soldQuantity, row.unitName)}`}
              </span>
              <span className={styles.muted}>
                {`Achat ${formatMoney(row.lastPriceTnd)} · vente ${formatMoney(row.salePriceTnd)}`}
              </span>
            </>
          )}
        />
      )}
    </Card>
  );
}
