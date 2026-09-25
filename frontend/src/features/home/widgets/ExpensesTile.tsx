import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { formatMoney } from "../../../i18n/format.js";
import { fr, plural, t } from "../../../i18n/fr.js";
import type { HomeSummary } from "../home.api.js";
import type { HomePeriod } from "../homePeriod.js";
import styles from "./ExpensesTile.module.css";

/// Row 3, right: the posted expenses of the selected business day, with
/// the day before for comparison (issue #42). The 30-day sparkline of the
/// spec still needs daily totals the summary endpoint does not return.
export function ExpensesTile({
  expenses,
  period,
}: {
  expenses: NonNullable<HomeSummary["expenses"]>;
  period: HomePeriod;
}) {
  return (
    <Card tone="muted">
      <CardHeader
        as="h3"
        title={
          period === "yesterday" ? fr.expensesOfYesterday : fr.expensesOfDay
        }
      />
      <p className={`${styles.value} tabular-nums`}>
        {formatMoney(expenses.dayTnd)}
      </p>
      <p className={styles.note}>
        {plural(expenses.dayCount, "dépense validée", "dépenses validées")} ·{" "}
        {t("previousDayWas", { amount: formatMoney(expenses.previousDayTnd) })}
      </p>
    </Card>
  );
}
