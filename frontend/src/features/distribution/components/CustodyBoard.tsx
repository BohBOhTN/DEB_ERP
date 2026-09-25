import { useMemo } from "react";
import { Accordion } from "../../../components/patterns/Accordion/Accordion.js";
import { Badge } from "../../../components/ui/Badge/Badge.js";
import { EmptyState } from "../../../components/ui/EmptyState/EmptyState.js";
import { formatDate, formatQuantity } from "../../../i18n/format.js";
import type { CustodyLine } from "../distribution.api.js";
import { safeDecimal } from "../distribution.schemas.js";
import styles from "./DistributionForms.module.css";

export interface CustodyBoardProps {
  items: CustodyLine[];
}

/// Custody by distributor (DST-019, DST-021): every line still held or with
/// a discrepancy, grouped in an accordion with the distributor's totals; the
/// discrepancy stays visible until someone follows it up.
export function CustodyBoard({ items }: CustodyBoardProps) {
  const groups = useMemo(() => {
    const byDistributor = new Map<
      string,
      { name: string; lines: CustodyLine[] }
    >();
    for (const line of items) {
      const group = byDistributor.get(line.distributorId) ?? {
        name: line.distributorName,
        lines: [],
      };
      group.lines.push(line);
      byDistributor.set(line.distributorId, group);
    }
    return [...byDistributor].map(([id, group]) => {
      const held = group.lines.reduce(
        (sum, line) => sum.plus(line.stillHeldQuantity),
        safeDecimal(0),
      );
      const unaccounted = group.lines.reduce(
        (sum, line) => sum.plus(line.unaccountedQuantity),
        safeDecimal(0),
      );
      return { id, ...group, held, unaccounted };
    });
  }, [items]);

  if (groups.length === 0) {
    return (
      <EmptyState
        title="Rien en dépôt"
        description="Aucune quantité n'est chez un distributeur ; une sortie en dépôt-vente apparaîtra ici."
      />
    );
  }

  return (
    <Accordion
      label="Dépôt-vente par distributeur"
      items={groups.map((group, index) => ({
        id: group.id,
        title: group.name,
        defaultOpen: index === 0,
        meta: (
          <>
            <span>{group.held.toString()} en dépôt</span>
            {group.unaccounted.greaterThan(0) ? (
              <Badge tone="danger">
                {group.unaccounted.toString()} non justifiées
              </Badge>
            ) : null}
          </>
        ),
        content: (
          <div className={styles.scroller}>
            <table
              className={styles.custodyTable}
              aria-label={`Dépôt de ${group.name}`}
            >
              <thead>
                <tr>
                  <th scope="col">Produit</th>
                  <th scope="col">Sortie</th>
                  <th scope="col">Vendue</th>
                  <th scope="col">Retournée</th>
                  <th scope="col">Non justifiée</th>
                  <th scope="col">Encore en dépôt</th>
                </tr>
              </thead>
              <tbody>
                {group.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      {line.productNameSnapshot}
                      <div className={styles.muted}>
                        {line.dispatchReference} ·{" "}
                        {formatDate(line.dispatchedAt)}
                      </div>
                    </td>
                    <td className="tabular-nums">
                      {formatQuantity(
                        line.dispatchedQuantity,
                        line.unitNameSnapshot,
                      )}
                    </td>
                    <td className="tabular-nums">
                      {formatQuantity(line.settledSoldQuantity)}
                    </td>
                    <td className="tabular-nums">
                      {formatQuantity(line.returnedQuantity)}
                    </td>
                    <td className="tabular-nums">
                      {Number(line.unaccountedQuantity) > 0 ? (
                        <Badge tone="danger">
                          {formatQuantity(line.unaccountedQuantity)}
                        </Badge>
                      ) : (
                        formatQuantity(line.unaccountedQuantity)
                      )}
                    </td>
                    <td className="tabular-nums">
                      <strong>{formatQuantity(line.stillHeldQuantity)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      }))}
    />
  );
}
