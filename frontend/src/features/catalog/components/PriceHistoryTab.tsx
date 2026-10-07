import Decimal from "decimal.js-light";
import { Link } from "react-router-dom";
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
import { ErrorState } from "../../../components/ui/ErrorState/ErrorState.js";
import { Skeleton } from "../../../components/ui/Skeleton/Skeleton.js";
import { describeError } from "../../../i18n/errors.js";
import {
  formatDate,
  formatMoney,
  formatQuantity,
} from "../../../i18n/format.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type {
  ProductPriceHistory,
  PurchasePricePoint,
} from "../catalog.api.js";
import {
  useProductPriceHistory,
  useRawMaterialPriceHistory,
} from "../catalog.queries.js";
import styles from "../pages/CatalogPages.module.css";

export type PriceHistoryItem =
  | { productId: string; unitSymbol: string }
  | { rawMaterialId: string; unitSymbol: string };

/// `Prix` on a resold product or a raw material (issue 023, DEC-V2-013):
/// what was paid for it over its posted purchases, per base unit, and for
/// a product the sale prices it had beside them. The cost of a product is
/// never touched by a purchase; this is where the owner reads the gap.
export function PriceHistoryTab({ item }: { item: PriceHistoryItem }) {
  return "productId" in item ? (
    <ProductPrices productId={item.productId} unitSymbol={item.unitSymbol} />
  ) : (
    <RawMaterialPrices
      rawMaterialId={item.rawMaterialId}
      unitSymbol={item.unitSymbol}
    />
  );
}

function ProductPrices({
  productId,
  unitSymbol,
}: {
  productId: string;
  unitSymbol: string;
}) {
  const query = useProductPriceHistory(productId);
  const permissions = useSessionPermissions();

  if (query.isError) {
    return (
      <QueryError error={query.error} retry={() => void query.refetch()} />
    );
  }
  if (!query.data) {
    return <Skeleton variant="table" rows={4} />;
  }

  const history = query.data;
  const purchases = history.purchasePrices;
  const salePriceAt = (at: string) =>
    history.salePrices.filter((row) => row.effectiveAt <= at).at(-1)
      ?.salePriceTnd ?? null;
  const last = purchases?.at(-1) ?? null;
  // The owner's figure beside the owner's price: behind margin.view like
  // every margin (DEC-V2-005).
  const gap =
    last && permissions.has("margin.view")
      ? new Decimal(history.currentSalePriceTnd)
          .minus(last.unitPriceTnd)
          .toFixed(3)
      : null;

  return (
    <div className={styles.priceStack}>
      <KpiGrid columns={3}>
        <KpiTile
          label="Prix de vente actuel"
          value={formatMoney(history.currentSalePriceTnd, { unit: false })}
          unit="TND"
          note={
            gap !== null
              ? `${formatMoney(gap)} au-dessus du dernier prix d'achat`
              : `${history.salePrices.length} prix depuis la création`
          }
        />
        {purchases ? (
          <PurchaseTiles purchases={purchases} unitSymbol={unitSymbol} />
        ) : null}
      </KpiGrid>
      {purchases ? (
        <PurchaseChart
          purchases={purchases}
          unitSymbol={unitSymbol}
          salePriceAt={salePriceAt}
        />
      ) : null}
      <SalePricesCard history={history} />
      {purchases ? (
        <PurchasesCard purchases={purchases} unitSymbol={unitSymbol} />
      ) : null}
    </div>
  );
}

function RawMaterialPrices({
  rawMaterialId,
  unitSymbol,
}: {
  rawMaterialId: string;
  unitSymbol: string;
}) {
  const query = useRawMaterialPriceHistory(rawMaterialId);

  if (query.isError) {
    return (
      <QueryError error={query.error} retry={() => void query.refetch()} />
    );
  }
  if (!query.data) {
    return <Skeleton variant="table" rows={4} />;
  }

  const purchases = query.data.purchasePrices;

  if (purchases.length === 0) {
    return (
      <EmptyState
        title="Aucun achat validé"
        description="Le prix d'achat apparaîtra ici dès le premier achat validé de cette matière."
      />
    );
  }

  return (
    <div className={styles.priceStack}>
      <KpiGrid columns={2}>
        <PurchaseTiles purchases={purchases} unitSymbol={unitSymbol} />
      </KpiGrid>
      <PurchaseChart purchases={purchases} unitSymbol={unitSymbol} />
      <PurchasesCard purchases={purchases} unitSymbol={unitSymbol} />
    </div>
  );
}

function QueryError({ error, retry }: { error: unknown; retry: () => void }) {
  const copy = describeError(error);
  return (
    <ErrorState
      title={copy.title}
      description={copy.description}
      onRetry={retry}
    />
  );
}

/// Whole percent between the first and the last price paid.
function changePercent(purchases: PurchasePricePoint[]): number | null {
  const first = purchases[0];
  const last = purchases.at(-1);
  if (!first || !last || first === last) {
    return null;
  }
  const from = new Decimal(first.unitPriceTnd);
  return from.isZero()
    ? null
    : new Decimal(last.unitPriceTnd)
        .minus(from)
        .dividedBy(from)
        .times(100)
        .toDecimalPlaces(0)
        .toNumber();
}

function PurchaseTiles({
  purchases,
  unitSymbol,
}: {
  purchases: PurchasePricePoint[];
  unitSymbol: string;
}) {
  const last = purchases.at(-1);
  const change = changePercent(purchases);

  if (!last) {
    return (
      <KpiTile
        label="Dernier prix d'achat"
        value="—"
        note="aucun achat validé"
      />
    );
  }

  return (
    <>
      <KpiTile
        label="Dernier prix d'achat"
        value={formatMoney(last.unitPriceTnd, { unit: false })}
        unit={`TND / ${unitSymbol}`}
        note={`le ${formatDate(last.purchasedAt)} chez ${last.supplier.name}`}
      />
      <KpiTile
        label="Évolution du prix d'achat"
        value={
          change === null
            ? "—"
            : `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change)} %`
        }
        note={
          purchases.length > 1
            ? `du premier au dernier des ${purchases.length} achats`
            : "un seul achat validé"
        }
      />
    </>
  );
}

function PurchaseChart({
  purchases,
  unitSymbol,
  salePriceAt,
}: {
  purchases: PurchasePricePoint[];
  unitSymbol: string;
  salePriceAt?: (at: string) => string | null;
}) {
  if (purchases.length === 0) {
    return (
      <EmptyState
        size="sm"
        title="Aucun achat validé"
        description="Le prix d'achat apparaîtra ici dès le premier achat validé."
      />
    );
  }

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Variation des prix"
        description={
          salePriceAt
            ? `Le prix d'achat par ${unitSymbol} à chaque achat validé, et le prix de vente en vigueur ce jour-là.`
            : `Le prix d'achat par ${unitSymbol} à chaque achat validé.`
        }
      />
      <TrendChart
        title="Prix d'achat par achat"
        points={purchases.map((row) => {
          const sale = salePriceAt?.(row.purchasedAt) ?? null;
          return {
            label: `${formatDate(row.purchasedAt)} · ${row.supplier.name}`,
            tick: formatDate(row.purchasedAt).slice(0, 5),
            value: Number(row.unitPriceTnd),
            formatted: formatMoney(row.unitPriceTnd),
            comparison: sale === null ? null : Number(sale),
            comparisonFormatted: sale === null ? undefined : formatMoney(sale),
          };
        })}
        seriesLabel="Prix d'achat"
        comparisonLabel={salePriceAt ? "Prix de vente" : undefined}
        formatScale={(value) => formatMoney(value)}
      />
    </Card>
  );
}

function PurchasesCard({
  purchases,
  unitSymbol,
}: {
  purchases: PurchasePricePoint[];
  unitSymbol: string;
}) {
  const rows = [...purchases].reverse();
  const columns: DataTableColumn<PurchasePricePoint>[] = [
    {
      id: "date",
      header: "Date",
      accessorFn: (row) => formatDate(row.purchasedAt),
    },
    {
      id: "purchase",
      header: "Achat",
      cell: ({ row }) => (
        <Link to={`/achats/${row.original.purchaseId}`}>
          {row.original.reference ?? "Achat"}
        </Link>
      ),
    },
    {
      id: "supplier",
      header: "Fournisseur",
      accessorFn: (row) => row.supplier.name,
    },
    {
      id: "quantity",
      header: "Quantité",
      meta: { align: "right" },
      accessorFn: (row) => formatQuantity(row.quantity, unitSymbol),
    },
    {
      id: "price",
      header: `Prix par ${unitSymbol}`,
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.unitPriceTnd),
    },
  ];

  if (rows.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Achats validés"
        description="Du plus récent au plus ancien."
      />
      <DataTable<PurchasePricePoint>
        label="Prix d'achat"
        columns={columns}
        data={rows}
        total={rows.length}
        page={1}
        pageSize={Math.max(rows.length, 1)}
        onChange={() => undefined}
        getRowId={(row) => row.lineId}
        mobileCard={(row) => (
          <>
            <span className={styles.cardTop}>
              <strong>{formatDate(row.purchasedAt)}</strong>
              <span className="tabular-nums">
                {formatMoney(row.unitPriceTnd)}
              </span>
            </span>
            <span className={styles.muted}>
              {`${row.supplier.name} · ${formatQuantity(row.quantity, unitSymbol)}`}
            </span>
          </>
        )}
      />
    </Card>
  );
}

function SalePricesCard({ history }: { history: ProductPriceHistory }) {
  const rows = [...history.salePrices].reverse();
  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    {
      id: "date",
      header: "Depuis le",
      accessorFn: (row) => formatDate(row.effectiveAt),
    },
    {
      id: "price",
      header: "Prix de vente",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.salePriceTnd),
    },
    {
      id: "state",
      header: "",
      cell: ({ row }) =>
        row.index === 0 ? <Badge tone="success">En vigueur</Badge> : null,
    },
  ];

  return (
    <Card>
      <CardHeader
        as="h2"
        title="Prix de vente"
        description="Chaque prix que ce produit a eu, du plus récent au plus ancien."
      />
      <DataTable<(typeof rows)[number]>
        label="Prix de vente"
        columns={columns}
        data={rows}
        total={rows.length}
        page={1}
        pageSize={Math.max(rows.length, 1)}
        onChange={() => undefined}
        getRowId={(row) => row.id}
        mobileCard={(row) => (
          <span className={styles.cardTop}>
            <strong>{formatDate(row.effectiveAt)}</strong>
            <span className="tabular-nums">
              {formatMoney(row.salePriceTnd)}
            </span>
          </span>
        )}
      />
    </Card>
  );
}
