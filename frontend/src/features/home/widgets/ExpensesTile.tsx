import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { formatMoney } from "../../../i18n/format.js";
import { plural } from "../../../i18n/fr.js";
import type { HomeSummary } from "../home.api.js";
import styles from "./ExpensesTile.module.css";

/// Row 3, right: the month's expenses. The 30-day sparkline of the spec
/// needs daily totals the summary endpoint does not return yet; the tile
/// shows the month figure and count until BE adds them (see brief).
export function ExpensesTile({
  expenses,
}: {
  expenses: NonNullable<HomeSummary["expenses"]>;
}) {
  return (
    <Card tone="muted">
      <CardHeader as="h3" title="Dépenses du mois" />
      <p className={`${styles.value} tabular-nums`}>
        {formatMoney(expenses.monthTnd)}
      </p>
      <p className={styles.note}>
        {plural(expenses.monthCount, "dépense validée", "dépenses validées")}
      </p>
    </Card>
  );
}
