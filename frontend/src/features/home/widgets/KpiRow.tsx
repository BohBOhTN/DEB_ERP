import Decimal from "decimal.js-light";
import { Banknote, Receipt, Users, Wallet } from "lucide-react";
import { Badge } from "../../../components/ui/Badge/Badge.js";
import { KpiGrid } from "../../../components/patterns/KpiGrid/KpiGrid.js";
import {
  KpiTile,
  type KpiDelta,
} from "../../../components/patterns/KpiTile/KpiTile.js";
import { formatMoney } from "../../../i18n/format.js";
import { plural } from "../../../i18n/fr.js";
import type { HomeSummary } from "../home.api.js";

export interface KpiRowProps {
  summary: HomeSummary | undefined;
  loading: boolean;
}

/// Row 1 of `Accueil`: the four figures the owner looks at first. A tile is
/// absent when its block is `null` (no permission), never shown as zero.
export function KpiRow({ summary, loading }: KpiRowProps) {
  if (loading || !summary) {
    return (
      <KpiGrid>
        <KpiTile label="" value="" loading />
        <KpiTile label="" value="" loading />
        <KpiTile label="" value="" loading />
        <KpiTile label="" value="" loading />
      </KpiGrid>
    );
  }

  const tiles = [];

  if (summary.sales) {
    tiles.push(
      <KpiTile
        key="sales"
        featured
        label="Ventes du jour"
        value={formatMoney(summary.sales.today.totalTnd, { unit: false })}
        unit="TND"
        icon={<Receipt />}
        delta={salesDelta(
          summary.sales.today.totalTnd,
          summary.sales.previousDay.totalTnd,
        )}
        note={plural(summary.sales.today.count, "vente")}
      />,
      <KpiTile
        key="cash"
        label="Encaissé en espèces"
        value={formatMoney(summary.sales.today.cashTnd, { unit: false })}
        unit="TND"
        icon={<Banknote />}
      />,
    );
  }

  if (
    summary.receivables &&
    (summary.receivables.customersTnd !== null ||
      summary.receivables.distributorsTnd !== null)
  ) {
    const total = new Decimal(summary.receivables.customersTnd ?? 0).plus(
      summary.receivables.distributorsTnd ?? 0,
    );

    tiles.push(
      <KpiTile
        key="receivables"
        label="Reste à encaisser clients"
        value={formatMoney(total.toFixed(3), { unit: false })}
        unit="TND"
        icon={<Users />}
        note={
          summary.receivables.distributorsTnd !== null &&
          summary.receivables.customersTnd !== null
            ? `dont distributeurs ${formatMoney(summary.receivables.distributorsTnd)}`
            : undefined
        }
        href="/clients"
      />,
    );
  }

  if (summary.payables) {
    tiles.push(
      <KpiTile
        key="payables"
        label="À payer fournisseurs"
        value={formatMoney(summary.payables.suppliersTnd, { unit: false })}
        unit="TND"
        icon={<Wallet />}
        badge={
          summary.payables.overdueCount > 0 ? (
            <Badge tone="danger">
              {plural(summary.payables.overdueCount, "en retard", "en retard")}
            </Badge>
          ) : undefined
        }
        href="/achats"
      />,
    );
  }

  if (tiles.length === 0) {
    return null;
  }

  return (
    <KpiGrid columns={tiles.length >= 4 ? 4 : tiles.length === 3 ? 3 : 2}>
      {tiles}
    </KpiGrid>
  );
}

export function salesDelta(
  today: string,
  previous: string,
): KpiDelta | undefined {
  const current = new Decimal(today);
  const before = new Decimal(previous);

  if (before.isZero()) {
    return current.isZero()
      ? { label: "Comme hier", direction: "flat" }
      : { label: "Hier : 0,000 TND", direction: "up" };
  }

  const ratio = current
    .minus(before)
    .dividedBy(before)
    .times(100)
    .toDecimalPlaces(0);
  const direction = ratio.greaterThan(0)
    ? "up"
    : ratio.lessThan(0)
      ? "down"
      : "flat";
  const sign = direction === "up" ? "+" : direction === "down" ? "−" : "";

  return { label: `${sign}${ratio.abs().toString()} % vs hier`, direction };
}
