import { Croissant, PackageX, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { BarChart } from "../../../components/patterns/BarChart/BarChart.js";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { KpiGrid } from "../../../components/patterns/KpiGrid/KpiGrid.js";
import { KpiTile } from "../../../components/patterns/KpiTile/KpiTile.js";
import { RankedList } from "../../../components/patterns/RankedList/RankedList.js";
import { Badge } from "../../../components/ui/Badge/Badge.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState.js";
import {
  formatDate,
  formatInteger,
  formatMoney,
  formatQuantity,
} from "../../../i18n/format.js";
import { plural } from "../../../i18n/fr.js";
import { useUrlState } from "../../../lib/hooks/useUrlState.js";
import type {
  AnalyticsProducts,
  AnalyticsQuery,
  ProductAnalysis,
} from "../analytics.api.js";
import { useAnalyticsProducts } from "../analytics.queries.js";
import { moneyWithShare, shareOf } from "../analyticsFormat.js";
import { AnalysisState } from "../AnalysisState.js";
import styles from "../Analytics.module.css";

const defaults = { page: 1, pageSize: 10 };
const ranked = 8;

/// `Produits`: what sells over every channel, how often, what it earns
/// approximately, and what did not sell at all.
export function ProductsTab({ query }: { query: AnalyticsQuery }) {
  return (
    <AnalysisState query={useAnalyticsProducts(query)}>
      {(products) => (
        <>
          <KpiGrid columns={3}>
            <KpiTile
              featured
              label="Produits vendus"
              value={formatInteger(products.totals.productsCount)}
              icon={<Croissant />}
              note="au moins une vente sur la période"
            />
            <KpiTile
              label="Chiffre d'affaires des produits"
              value={formatMoney(products.totals.revenueTnd, { unit: false })}
              unit="TND"
              icon={<TrendingUp />}
              note="comptoir, commandes et distributeurs"
            />
            <KpiTile
              label="Produits sans vente"
              value={formatInteger(products.unsold.count)}
              icon={<PackageX />}
              note="produits actifs non vendus sur la période"
            />
          </KpiGrid>
          {products.items.length === 0 ? (
            <EmptyState
              illustration="shelf"
              title="Aucun produit vendu sur cette période"
              description="Choisissez une période plus longue."
            />
          ) : (
            <>
              <div className={styles.two}>
                <BestSellersCard products={products} />
                <CategoriesCard products={products} />
              </div>
              <MarginsCard products={products} />
              <ProductsTable products={products} />
            </>
          )}
          <UnsoldCard products={products} />
        </>
      )}
    </AnalysisState>
  );
}

function productLink(item: { productId: string; name: string }) {
  return <Link to={`/produits/${item.productId}`}>{item.name}</Link>;
}

function BestSellersCard({ products }: { products: AnalyticsProducts }) {
  return (
    <Card>
      <CardHeader
        as="h2"
        title="Meilleures ventes"
        description="Les produits qui rapportent le plus."
      />
      <RankedList
        title="Meilleures ventes par chiffre d'affaires"
        items={products.items.slice(0, ranked).map((item) => ({
          label: productLink(item),
          value: Number(item.revenueTnd),
          formatted: moneyWithShare(
            item.revenueTnd,
            products.totals.revenueTnd,
          ),
        }))}
      />
    </Card>
  );
}

function CategoriesCard({ products }: { products: AnalyticsProducts }) {
  return (
    <Card>
      <CardHeader
        as="h2"
        title="Catégories"
        description="Chiffre d'affaires par catégorie de produits."
      />
      <BarChart
        title="Chiffre d'affaires par catégorie"
        data={products.categories.slice(0, ranked).map((category) => ({
          label: category.name,
          value: Number(category.revenueTnd),
          formatted: moneyWithShare(
            category.revenueTnd,
            products.totals.revenueTnd,
          ),
        }))}
      />
    </Card>
  );
}

/// Only with `margin.view`: without it the server sends no cost figure.
function MarginsCard({ products }: { products: AnalyticsProducts }) {
  const costed = products.items
    .filter((item) => item.marginTnd !== null)
    .sort((left, right) => Number(right.marginTnd) - Number(left.marginTnd))
    .slice(0, 5);

  if (costed.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Meilleures marges approximatives"
        description="Ventes en caisse des produits dont le coût est renseigné, ingrédients seulement."
      />
      <RankedList
        title="Meilleures marges approximatives"
        items={costed.map((item) => ({
          label: productLink(item),
          value: Math.max(0, Number(item.marginTnd)),
          formatted: formatMoney(item.marginTnd),
        }))}
      />
    </Card>
  );
}

function ProductsTable({ products }: { products: AnalyticsProducts }) {
  const [state, setState] = useUrlState(defaults);
  const { items, totals } = products;
  const withMargin = items.some((item) => item.costedRevenueTnd !== null);
  const pageCount = Math.max(1, Math.ceil(items.length / state.pageSize));
  const page = Math.min(state.page, pageCount);
  // The server sends one ranked row per product sold, a list bounded by
  // the catalogue; the pages are cut from it here.
  const rows = items.slice((page - 1) * state.pageSize, page * state.pageSize);
  const frequency = (item: ProductAnalysis) =>
    plural(item.documentsCount, "vente");
  const columns: DataTableColumn<ProductAnalysis>[] = [
    {
      id: "name",
      header: "Produit",
      cell: ({ row }) => productLink(row.original),
    },
    {
      id: "category",
      header: "Catégorie",
      accessorFn: (row) => row.categoryName,
    },
    {
      id: "quantity",
      header: "Quantité",
      meta: { align: "right" },
      accessorFn: (row) => formatQuantity(row.quantity, row.unitName),
    },
    {
      id: "frequency",
      header: "Fréquence",
      meta: { align: "right" },
      accessorFn: frequency,
    },
    {
      id: "revenue",
      header: "Chiffre d'affaires",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.revenueTnd),
    },
    {
      id: "share",
      header: "Part",
      meta: { align: "right" },
      accessorFn: (row) => `${shareOf(row.revenueTnd, totals.revenueTnd)} %`,
    },
    ...(withMargin
      ? [
          {
            id: "margin",
            header: "Marge approx.",
            meta: { align: "right" as const },
            accessorFn: (row: ProductAnalysis) =>
              row.marginTnd === null ? "—" : formatMoney(row.marginTnd),
          },
        ]
      : []),
    {
      id: "last",
      header: "Dernière vente",
      accessorFn: (row) => formatDate(row.lastSoldAt),
    },
  ];

  return (
    <DataTable<ProductAnalysis>
      label="Détail par produit"
      columns={columns}
      data={rows}
      total={items.length}
      page={page}
      pageSize={state.pageSize}
      onChange={(change) =>
        setState({
          ...(change.page ? { page: change.page } : {}),
          ...(change.pageSize ? { pageSize: change.pageSize, page: 1 } : {}),
        })
      }
      getRowId={(row) => row.productId}
      mobileCard={(row) => (
        <>
          <span className={styles.cardTop}>
            <strong>{row.name}</strong>
            <span className="tabular-nums">{formatMoney(row.revenueTnd)}</span>
          </span>
          <span className={styles.muted}>
            {`${formatQuantity(row.quantity, row.unitName)} · ${frequency(row)} · ${shareOf(row.revenueTnd, totals.revenueTnd)} %`}
          </span>
          {row.marginTnd !== null ? (
            <span className={styles.muted}>
              {`Marge approx. ${formatMoney(row.marginTnd)}`}
            </span>
          ) : null}
        </>
      )}
    />
  );
}

function UnsoldCard({ products }: { products: AnalyticsProducts }) {
  const { unsold } = products;

  if (unsold.count === 0) {
    return null;
  }

  const more = unsold.count - unsold.items.length;

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Produits sans vente"
        description="Produits actifs qui ne se sont pas vendus sur la période : à relancer ou à retirer."
      />
      <ul className={styles.chips} aria-label="Produits sans vente">
        {unsold.items.map((item) => (
          <li key={item.productId}>
            <Badge tone="neutral">{productLink(item)}</Badge>
          </li>
        ))}
        {more > 0 ? (
          <li>
            <Badge tone="warning">
              {`et ${plural(more, "autre produit", "autres produits")}`}
            </Badge>
          </li>
        ) : null}
      </ul>
    </Card>
  );
}
