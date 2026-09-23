import { Plus } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { KeyValueList } from "../../../components/patterns/KeyValueList/KeyValueList.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { TotalsCard } from "../../../components/patterns/TotalsCard/TotalsCard.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { ErrorState } from "../../../components/ui/ErrorState/ErrorState.js";
import { Skeleton } from "../../../components/ui/Skeleton/Skeleton.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { describeError } from "../../../i18n/errors.js";
import {
  formatDateTime,
  formatMoney,
  formatQuantity,
} from "../../../i18n/format.js";
import { salePaymentPill } from "../../customers/components/customerLabels.js";
import { useSale } from "../pos.queries.js";
import styles from "./PosPages.module.css";

/// `/caisse/ventes/:id` (UI-15): the receipt view, with "Nouvelle vente"
/// back to the till. Printing waits for OD-013 (Sprint 27).
export function SaleDetailPage() {
  const { saleId = "" } = useParams();
  const navigate = useNavigate();
  const query = useSale(saleId);
  const sale = query.data;

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

  if (!sale) {
    return <Skeleton variant="table" rows={6} />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Ventes"
        title={sale.reference}
        breadcrumbs={[
          { label: "Ventes", href: "/caisse/ventes" },
          { label: sale.reference },
        ]}
        badge={
          <StatusPill
            {...salePaymentPill(sale.paymentState)}
            label={
              sale.paymentState === "PAID"
                ? "Payée"
                : sale.paymentState === "PARTIALLY_PAID"
                  ? "Partielle"
                  : "Impayée"
            }
          />
        }
        actions={
          <Button leftIcon={<Plus />} onClick={() => navigate("/caisse")}>
            Nouvelle vente
          </Button>
        }
      />
      <div className={styles.stack}>
        <Card>
          <CardHeader
            as="h2"
            title="Ticket"
            description={`${formatDateTime(sale.soldAt)} · ${sale.postedBy?.displayName ?? "—"}${sale.session ? ` · ${sale.session.terminal.name}` : ""}`}
          />
          <div className={styles.receipt}>
            <ul className={styles.receiptLines} aria-label="Articles">
              {(sale.lines ?? []).map((line) => (
                <li key={line.id} className={styles.receiptLine}>
                  <span>
                    {formatQuantity(line.quantity, line.unitNameSnapshot)}{" "}
                    {line.productNameSnapshot}
                    <span className={styles.muted}>
                      {" "}
                      × {formatMoney(line.unitPriceTnd)}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(line.lineTotalTnd)}
                  </span>
                </li>
              ))}
            </ul>
            <TotalsCard
              totalTnd={sale.totalTnd}
              paidTnd={sale.paidAmountTnd}
              remainingTnd={sale.remainingDueTnd}
            />
            <KeyValueList
              items={[
                {
                  label: "Client",
                  value: sale.customer ? (
                    <Link to={`/clients/${sale.customer.id}`}>
                      {sale.customer.name}
                    </Link>
                  ) : (
                    "Client de passage"
                  ),
                },
                {
                  label: "Paiements",
                  value:
                    (sale.payments ?? []).length > 0
                      ? (sale.payments ?? [])
                          .map(
                            (payment) =>
                              `${formatMoney(payment.amountTnd)} en espèces le ${formatDateTime(payment.paidAt)}`,
                          )
                          .join(" · ")
                      : "Aucun paiement à la vente",
                },
                {
                  label: "Session",
                  value: sale.session ? (
                    <Link to={`/caisse/sessions/${sale.session.id}`}>
                      Ouverte le {formatDateTime(sale.session.openedAt)}
                    </Link>
                  ) : null,
                },
              ]}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
