import { Link, useParams } from "react-router-dom";
import { KeyValueList } from "../../../components/patterns/KeyValueList/KeyValueList.js";
import { KpiTile } from "../../../components/patterns/KpiTile/KpiTile.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { ErrorState } from "../../../components/ui/ErrorState/ErrorState.js";
import { Skeleton } from "../../../components/ui/Skeleton/Skeleton.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { cx } from "../../../lib/cx.js";
import { describeError } from "../../../i18n/errors.js";
import { formatDateTime, formatMoney } from "../../../i18n/format.js";
import { expectedCash } from "../components/CloseSessionDialog.js";
import { useSessionDetail } from "../pos.queries.js";
import { differenceClass } from "./SessionsPage.js";
import styles from "./PosPages.module.css";

/// `/caisse/sessions/:id` (UI-15, BE-30): the session summary with its
/// drawer totals summed by the database.
export function SessionDetailPage() {
  const { sessionId = "" } = useParams();
  const query = useSessionDetail(sessionId);

  if (query.isError) {
    const copy = describeError(query.error);
    return (
      <ErrorState
        title={copy.title}
        description={copy.description}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!query.data) {
    return <Skeleton variant="table" rows={6} />;
  }

  const { session, totals } = query.data;
  const expected =
    session.expectedCashTnd ?? expectedCash(session, totals).toFixed(3);
  const title = `Session du ${formatDateTime(session.openedAt)}`;

  return (
    <>
      <PageHeader
        eyebrow="Ventes"
        title={title}
        breadcrumbs={[
          { label: "Sessions", href: "/caisse/sessions" },
          { label: title },
        ]}
        badge={
          <StatusPill
            status={session.status}
            label={session.status === "OPEN" ? "Ouverte" : "Fermée"}
          />
        }
      />
      <div className={styles.stack}>
        <div className={styles.kpis}>
          <KpiTile
            label="Ventes"
            value={String(totals.salesCount)}
            note={formatMoney(totals.salesTotalTnd)}
          />
          <KpiTile
            label="Espèces encaissées"
            value={formatMoney(totals.cashCollectedTnd)}
          />
          <KpiTile
            label="Crédit accordé"
            value={formatMoney(totals.creditGrantedTnd)}
          />
          <KpiTile
            label="Écart de caisse"
            value={
              <span className={cx(differenceClass(session.cashDifferenceTnd))}>
                {session.cashDifferenceTnd
                  ? formatMoney(session.cashDifferenceTnd)
                  : "—"}
              </span>
            }
          />
        </div>
        <Card>
          <CardHeader as="h2" title="Caisse" />
          <KeyValueList
            columns={2}
            items={[
              { label: "Ouverte le", value: formatDateTime(session.openedAt) },
              {
                label: "Ouverte par",
                value: session.openedBy?.displayName ?? "—",
              },
              {
                label: "Fermée le",
                value: session.closedAt
                  ? formatDateTime(session.closedAt)
                  : "Encore ouverte",
              },
              { label: "Fermée par", value: session.closedBy?.displayName },
              {
                label: "Fonds de caisse",
                value: formatMoney(session.openingCashTnd),
                numeric: true,
              },
              {
                label: "Acomptes encaissés",
                value: formatMoney(totals.advancesReceivedTnd),
                numeric: true,
              },
              {
                label: "Acomptes remboursés",
                value: formatMoney(totals.advancesRefundedTnd),
                numeric: true,
              },
              {
                label: "Règlements clients à la caisse",
                value: formatMoney(totals.customerPaymentsTnd),
                numeric: true,
              },
              {
                label: "Espèces attendues",
                value: formatMoney(expected),
                numeric: true,
              },
              {
                label: "Espèces comptées",
                value: session.countedCashTnd
                  ? formatMoney(session.countedCashTnd)
                  : null,
                numeric: true,
              },
              { label: "Notes", value: session.notes },
              {
                label: "Ventes de la session",
                value: (
                  <Link to={`/caisse/ventes?sessionId=${session.id}&from=&to=`}>
                    Voir les ventes
                  </Link>
                ),
              },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
