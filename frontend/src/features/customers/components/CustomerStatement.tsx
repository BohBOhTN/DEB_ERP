import Decimal from "decimal.js-light";
import { Printer } from "lucide-react";
import { useState } from "react";
import {
  StatementTable,
  type StatementEntry,
} from "../../../components/patterns/StatementTable/StatementTable.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { DateInput } from "../../../components/ui/DateInput/DateInput.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { formatDate } from "../../../i18n/format.js";
import { useCustomerStatementPages } from "../customers.queries.js";
import { ledgerLabel } from "./customerLabels.js";
import styles from "../pages/CustomerPages.module.css";

/// Customer receivable statement (07 section 4.4, NFR-007): date range,
/// opening and closing balance, running balance and the server-stated
/// basis; advances are listed but do not enter the receivable balance.
export function CustomerStatement({ customerId }: { customerId: string }) {
  const [range, setRange] = useState({ from: "", to: "" });
  const query = useCustomerStatementPages(customerId, {
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
      const receivable = entry.balanceKind === "RECEIVABLE";
      if (receivable) running = running.plus(amount);
      return {
        id: entry.id,
        at: entry.occurredAt,
        reference: null,
        label: receivable
          ? ledgerLabel(entry.entryType)
          : `${ledgerLabel(entry.entryType)} (avance)`,
        debitTnd:
          receivable && amount.greaterThan(0) ? amount.toFixed(3) : null,
        creditTnd:
          receivable && amount.lessThan(0) ? amount.abs().toFixed(3) : null,
        balanceTnd: running.toFixed(3),
        href: entry.orderId ? `/commandes/${entry.orderId}` : undefined,
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
    <div className={styles.tabBody}>
      <div className={styles.formGrid} data-print="hide">
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
      <div data-print="hide">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Printer />}
          onClick={() => window.print()}
        >
          Imprimer
        </Button>
      </div>
      <StatementTable
        label="Relevé client"
        entries={entries}
        openingBalanceTnd={first?.meta.openingBalanceTnd ?? "0"}
        closingBalanceTnd={first?.meta.closingBalanceTnd ?? "0"}
        rangeLabel={rangeLabel}
        basisLabel={first?.meta.basis ?? "Solde = ventes à crédit − règlements"}
        loading={query.isPending}
        hasMore={query.hasNextPage}
        onLoadMore={() => void query.fetchNextPage()}
        loadingMore={query.isFetchingNextPage}
      />
    </div>
  );
}
