import Decimal from "decimal.js-light";
import { useState } from "react";
import {
  StatementTable,
  type StatementEntry,
} from "../../../components/patterns/StatementTable/StatementTable.js";
import { DateInput } from "../../../components/ui/DateInput/DateInput.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { formatDate } from "../../../i18n/format.js";
import { useDistributorStatementPages } from "../distribution.queries.js";
import { ledgerEntryLabels } from "./distributionLabels.js";
import styles from "./DistributionForms.module.css";

/// Distributor statement (NFR-007): range, opening and closing balance,
/// running balance and the server-stated basis; more entries by cursor.
export function DistributorStatement({
  distributorId,
}: {
  distributorId: string;
}) {
  const [range, setRange] = useState({ from: "", to: "" });
  const query = useDistributorStatementPages(distributorId, {
    from: range.from || undefined,
    to: range.to || undefined,
  });
  const pages = query.data?.pages ?? [];
  const first = pages[0];

  let running = new Decimal(first?.meta.openingBalanceTnd ?? 0);
  const entries: StatementEntry[] = pages
    .flatMap((page) => page.ledgerEntries)
    .map((entry) => {
      const amount = new Decimal(entry.amountTnd);
      running = running.plus(amount);
      return {
        id: entry.id,
        at: entry.occurredAt,
        reference: null,
        label: ledgerEntryLabels[entry.entryType],
        debitTnd: amount.greaterThan(0) ? amount.toFixed(3) : null,
        creditTnd: amount.lessThan(0) ? amount.abs().toFixed(3) : null,
        balanceTnd: running.toFixed(3),
      };
    });
  const rangeLabel =
    range.from && range.to
      ? `Du ${formatDate(range.from)} au ${formatDate(range.to)}`
      : range.from
        ? `Depuis le ${formatDate(range.from)}`
        : range.to
          ? `Jusqu'au ${formatDate(range.to)}`
          : "Toutes les écritures";

  return (
    <div className={styles.stack}>
      <div className={styles.twoColumns}>
        <FormField label="Du">
          <DateInput
            value={range.from}
            onChange={(from) => setRange((current) => ({ ...current, from }))}
          />
        </FormField>
        <FormField label="Au">
          <DateInput
            value={range.to}
            onChange={(to) => setRange((current) => ({ ...current, to }))}
          />
        </FormField>
      </div>
      <StatementTable
        label="Relevé distributeur"
        entries={entries}
        openingBalanceTnd={first?.meta.openingBalanceTnd ?? "0"}
        closingBalanceTnd={first?.meta.closingBalanceTnd ?? "0"}
        rangeLabel={rangeLabel}
        basisLabel={
          first?.meta.basis ?? "Solde = ventes et règlements − paiements"
        }
        loading={query.isPending}
        hasMore={query.hasNextPage}
        onLoadMore={() => void query.fetchNextPage()}
        loadingMore={query.isFetchingNextPage}
      />
    </div>
  );
}
