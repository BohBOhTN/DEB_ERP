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
import { useSessionPermissions } from "../../../app/sessionContext.js";
import { useSale } from "../pos.queries.js";
import { SaleRowActions } from "../components/SaleRowActions.js";
import { salePill } from "../../customers/components/customerLabels.js";
import styles from "./PosPages.module.css";

/// `/caisse/ventes/:id` (UI-15, issue #44): the receipt view with every
/// movement of money on the sale (cash at the till, the order advance
/// applied, the règlements allocated later, the refund on cancellation),
/// the order it came from, and the actions of the list.
export function SaleDetailPage() {
  const { saleId = "" } = useParams();
  const navigate = useNavigate();
  const permissions = useSessionPermissions();
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

  const movements: Array<{ label: string; value: string }> = [
    ...(sale.payments ?? []).map((payment) => ({
      label:
        payment.movement === "REFUND"
          ? `Remboursé en espèces le ${formatDateTime(payment.paidAt)}`
          : `Espèces à la caisse le ${formatDateTime(payment.paidAt)}`,
      value: `${payment.movement === "REFUND" ? "−" : ""}${formatMoney(payment.amountTnd)}`,
    })),
    ...(Number(sale.appliedAdvanceTnd ?? 0) > 0
      ? [
          {
            label: "Acompte de la commande appliqué",
            value: formatMoney(sale.appliedAdvanceTnd ?? "0"),
          },
        ]
      : []),
    ...(sale.paymentAllocations ?? []).map((allocation) => ({
      label: `Règlement du ${formatDateTime(allocation.payment.paidAt)}${allocation.payment.reference ? ` (${allocation.payment.reference})` : ""}${allocation.payment.reversedAt ? ", annulé" : ""}`,
      value: allocation.payment.reversedAt
        ? `(${formatMoney(allocation.amountTnd)})`
        : formatMoney(allocation.amountTnd),
    })),
  ];

  return (
    <>
      <PageHeader
        eyebrow="Ventes"
        title={sale.reference}
        breadcrumbs={[
          { label: "Ventes", href: "/caisse/ventes" },
          { label: sale.reference },
        ]}
        badge={<StatusPill {...salePill(sale)} />}
        actions={
          <div className={styles.cardTop}>
            <SaleRowActions sale={sale} permissions={permissions} onReceipt />
            <Button leftIcon={<Plus />} onClick={() => navigate("/caisse")}>
              Nouvelle vente
            </Button>
          </div>
        }
      />
      <div className={styles.stack}>
        {sale.status === "CANCELLED" ? (
          <Card>
            <CardHeader
              as="h2"
              title="Vente annulée"
              description={`Le ${formatDateTime(sale.cancelledAt ?? sale.postedAt)}${sale.cancelledBy ? ` par ${sale.cancelledBy.displayName}` : ""} · ${sale.cancellationReason ?? ""}`}
            />
          </Card>
        ) : null}
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
                  label: "Commande",
                  value: sale.order ? (
                    <Link to={`/commandes/${sale.order.id}`}>
                      {sale.order.reference}
                    </Link>
                  ) : null,
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
        <Card>
          <CardHeader
            as="h2"
            title="Paiements"
            description="Tout ce qui a été encaissé, appliqué ou remboursé sur cette vente."
          />
          {movements.length === 0 ? (
            <p className={styles.muted}>Aucun paiement sur cette vente.</p>
          ) : (
            <KeyValueList
              items={movements.map((movement) => ({
                label: movement.label,
                value: movement.value,
                numeric: true,
              }))}
            />
          )}
        </Card>
      </div>
    </>
  );
}
