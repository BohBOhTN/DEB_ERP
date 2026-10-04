import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { KpiGrid } from "../../components/patterns/KpiGrid/KpiGrid.js";
import { KpiTile } from "../../components/patterns/KpiTile/KpiTile.js";
import { ErrorState } from "../../components/ui/ErrorState/ErrorState.js";
import { Skeleton } from "../../components/ui/Skeleton/Skeleton.js";
import { describeError } from "../../i18n/errors.js";
import styles from "./Analytics.module.css";

export interface AnalysisStateProps<TData> {
  query: UseQueryResult<TData>;
  children: (data: TData) => ReactNode;
}

/// The loading and error states every analysis tab shares: KPI and chart
/// skeletons, then either the figures or a retryable error with the
/// request's correlation id.
export function AnalysisState<TData>({
  query,
  children,
}: AnalysisStateProps<TData>) {
  if (query.isError) {
    const copy = describeError(query.error);

    return (
      <ErrorState
        title={copy.title}
        description={copy.description}
        onRetry={() => void query.refetch()}
        correlationId={
          (query.error as { correlationId?: string | null })?.correlationId
        }
      />
    );
  }

  if (!query.data) {
    return (
      <div className={styles.stack}>
        <KpiGrid columns={3}>
          <KpiTile label="" value="" loading />
          <KpiTile label="" value="" loading />
          <KpiTile label="" value="" loading />
        </KpiGrid>
        <Skeleton variant="rect" height={260} />
      </div>
    );
  }

  return <div className={styles.stack}>{children(query.data)}</div>;
}
