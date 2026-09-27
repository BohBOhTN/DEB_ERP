import { useState } from "react";
import { ErrorState } from "../../components/ui/ErrorState/ErrorState.js";
import { Skeleton } from "../../components/ui/Skeleton/Skeleton.js";
import { describeError } from "../../i18n/errors.js";
import { toPermissionSet } from "../../lib/auth/permissions.js";
import { useSessionContext } from "../../app/sessionContext.js";
import { useHomeSummary } from "./home.queries.js";
import { periodDate, type HomePeriod } from "./homePeriod.js";
import { AlertsCard } from "./widgets/AlertsCard.js";
import { GreetingBand } from "./widgets/GreetingBand.js";
import { KpiRow } from "./widgets/KpiRow.js";
import { QuickActionsCard } from "./widgets/QuickActionsCard.js";
import { RecentActivityCard } from "./widgets/RecentActivityCard.js";
import styles from "./AccueilPage.module.css";

/// `Accueil` (UI-08, 07 section 3.1): operational summary, blocks by
/// permission, no profitability (OD-V2-001).
export function AccueilPage() {
  const { user } = useSessionContext();
  const permissions = toPermissionSet(user.effectivePermissions);
  const [period, setPeriod] = useState<HomePeriod>("today");
  const query = useHomeSummary(periodDate(period));
  const summary = query.data;
  const empty = summary ? isFreshDatabase(summary) : false;

  return (
    <div className={styles.root}>
      <GreetingBand
        displayName={user.displayName}
        date={
          period === "yesterday"
            ? new Date(Date.now() - 86_400_000)
            : new Date()
        }
        period={period}
        onPeriodChange={setPeriod}
      />
      {query.isError ? (
        <ErrorState
          title={describeError(query.error).title}
          description={describeError(query.error).description}
          onRetry={() => void query.refetch()}
          correlationId={
            (query.error as { correlationId?: string | null })?.correlationId
          }
        />
      ) : (
        <>
          <KpiRow summary={summary} loading={query.isPending} period={period} />
          {empty ? (
            <p className={styles.emptyHint}>
              Commencez par ouvrir la caisse ou enregistrer un achat.
            </p>
          ) : null}
          <div className={styles.rowTwo}>
            {summary ? (
              <AlertsCard summary={summary} />
            ) : (
              <Skeleton variant="rect" height={180} />
            )}
            <QuickActionsCard
              permissions={permissions}
              sessionOpen={Boolean(summary?.openSession)}
            />
          </div>
          {summary?.recent ? (
            <RecentActivityCard recent={summary.recent} />
          ) : null}
        </>
      )}
    </div>
  );
}

/// A fresh database: nothing sold, no till open, nothing ordered, nothing
/// spent, nothing owed, nothing recorded. A quiet day on a live database
/// is not one (issue #42).
export function isFreshDatabase(summary: {
  sales: { today: { count: number } } | null;
  openSession: unknown | null;
  orders: {
    dueTodayCount: number;
    overdueCount: number;
    readyCount: number;
  } | null;
  expenses: { dayCount: number } | null;
  receivables: {
    customersTnd: string | null;
    distributorsTnd: string | null;
  } | null;
  recent: unknown[] | null;
  payables: { suppliersTnd: string } | null;
}): boolean {
  const zero = (value: string | null | undefined) => Number(value ?? 0) === 0;

  return (
    (summary.sales === null || summary.sales.today.count === 0) &&
    summary.openSession === null &&
    (summary.orders === null ||
      summary.orders.dueTodayCount +
        summary.orders.overdueCount +
        summary.orders.readyCount ===
        0) &&
    (summary.expenses === null || summary.expenses.dayCount === 0) &&
    (summary.receivables === null ||
      (zero(summary.receivables.customersTnd) &&
        zero(summary.receivables.distributorsTnd))) &&
    (summary.recent === null || summary.recent.length === 0) &&
    (summary.payables === null || zero(summary.payables.suppliersTnd))
  );
}
