import Decimal from "decimal.js-light";
import { useState } from "react";
import {
  StatementTable,
  type StatementEntry,
} from "../../../components/patterns/StatementTable/StatementTable.js";
import { DateInput } from "../../../components/ui/DateInput/DateInput.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { formatDate } from "../../../i18n/format.js";
import { useSupplierStatementPages } from "../procurement.queries.js";
import { ledgerEntryLabels } from "./procurementLabels.js";
import styles from "./ProcurementForms.module.css";

/// Supplier ledger statement (07 section 4.3, NFR-007): date range, opening
/// and closing balance, running balance per entry and the calculation basis
/// stated by the server. More entries load by cursor.
export function SupplierStatement({ supplierId }: { supplierId: string }) {
  const [range, setRange] = useState({ from: "", to: "" });
  const query = useSupplierStatementPages(supplierId, {
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
        reference:
          entry.purchase?.reference ?? entry.payment?.reference ?? null,
        label: ledgerEntryLabels[entry.entryType],
        debitTnd: amount.greaterThan(0) ? amount.toFixed(3) : null,
        creditTnd: amount.lessThan(0) ? amount.abs().toFixed(3) : null,
        balanceTnd: running.toFixed(3),
        href: entry.purchaseId ? `/achats/${entry.purchaseId}` : undefined,
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
    <div className={styles.allocations}>
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
        label="Relevé fournisseur"
        entries={entries}
        openingBalanceTnd={first?.meta.openingBalanceTnd ?? "0"}
        closingBalanceTnd={first?.meta.closingBalanceTnd ?? "0"}
        rangeLabel={rangeLabel}
        basisLabel={first?.meta.basis ?? "Solde = achats validés − paiements"}
        loading={query.isPending}
        hasMore={query.hasNextPage}
        onLoadMore={() => void query.fetchNextPage()}
        loadingMore={query.isFetchingNextPage}
      />
    </div>
  );
}
