import { useState } from "react";
import { ErrorState } from "../../components/ui/ErrorState/ErrorState.js";
import { Skeleton } from "../../components/ui/Skeleton/Skeleton.js";
import { describeError } from "../../i18n/errors.js";
import { toPermissionSet } from "../../lib/auth/permissions.js";
import { useSessionContext } from "../../app/sessionContext.js";
import { useHomeSummary } from "./home.queries.js";
import { periodDate, type HomePeriod } from "./homePeriod.js";
import { AlertsCard } from "./widgets/AlertsCard.js";
import { ExpensesTile } from "./widgets/ExpensesTile.js";
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
          <KpiRow summary={summary} loading={query.isPending} />
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
          <div className={styles.rowThree}>
            {summary?.recent ? (
              <RecentActivityCard recent={summary.recent} />
            ) : null}
            {summary?.expenses ? (
              <ExpensesTile expenses={summary.expenses} />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/// A fresh database: nothing sold, nothing owed, nothing recorded.
export function isFreshDatabase(summary: {
  sales: { today: { count: number } } | null;
  recent: unknown[] | null;
  payables: { suppliersTnd: string } | null;
}): boolean {
  return (
    (summary.sales === null || summary.sales.today.count === 0) &&
    (summary.recent === null || summary.recent.length === 0) &&
    (summary.payables === null || Number(summary.payables.suppliersTnd) === 0)
  );
}
