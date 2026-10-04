import { KpiGrid } from "../../../components/patterns/KpiGrid/KpiGrid.js";
import { KpiTile } from "../../../components/patterns/KpiTile/KpiTile.js";
import { formatInteger, formatMoney } from "../../../i18n/format.js";
import { plural } from "../../../i18n/fr.js";
import { cx } from "../../../lib/cx.js";
import type { SessionsSummary } from "../pos.api.js";
import { differenceClass } from "../sessionFormat.js";

/// The totals of the sessions the list shows (issue 014). Shortages and
/// surpluses are named apart: a net difference of zero can hide both.
export function SessionsKpis({
  summary,
}: {
  summary: SessionsSummary | undefined;
}) {
  if (!summary) {
    return (
      <KpiGrid>
        <KpiTile label="" value="" loading />
        <KpiTile label="" value="" loading />
        <KpiTile label="" value="" loading />
        <KpiTile label="" value="" loading />
      </KpiGrid>
    );
  }

  const average =
    summary.count === 0 ? null : Number(summary.salesTotalTnd) / summary.count;

  return (
    <KpiGrid>
      <KpiTile
        featured
        label="Sessions"
        value={formatInteger(summary.count)}
        note={
          summary.openCount > 0
            ? `dont ${plural(summary.openCount, "ouverte")}`
            : "toutes clôturées"
        }
      />
      <KpiTile
        label="Ventes des sessions"
        value={formatMoney(summary.salesTotalTnd, { unit: false })}
        unit="TND"
        note={plural(summary.salesCount, "vente")}
      />
      <KpiTile
        label="Moyenne par session"
        value={average === null ? "—" : formatMoney(average, { unit: false })}
        unit={average === null ? undefined : "TND"}
        note="ventes validées par session"
      />
      <KpiTile
        label="Écart de caisse cumulé"
        value={
          <span className={cx(differenceClass(summary.differenceTnd))}>
            {formatMoney(summary.differenceTnd, { unit: false })}
          </span>
        }
        unit="TND"
        note={
          summary.withDifferenceCount === 0
            ? "aucun écart"
            : `manque ${formatMoney(summary.shortageTnd)} · excédent ${formatMoney(summary.surplusTnd)}`
        }
      />
    </KpiGrid>
  );
}
