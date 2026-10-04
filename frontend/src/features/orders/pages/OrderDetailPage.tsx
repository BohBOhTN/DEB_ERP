import { ArrowRight, Ban, Banknote, Check, Pencil, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { KeyValueList } from "../../../components/patterns/KeyValueList/KeyValueList.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { TotalsCard } from "../../../components/patterns/TotalsCard/TotalsCard.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { ErrorState } from "../../../components/ui/ErrorState/ErrorState.js";
import { Skeleton } from "../../../components/ui/Skeleton/Skeleton.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { describeError } from "../../../i18n/errors.js";
import {
  formatDateTime,
  formatMoney,
  formatQuantity,
} from "../../../i18n/format.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type { OrderLine } from "../orders.api.js";
import { useChangeOrderStatus, useOrder } from "../orders.queries.js";
import { AdvanceDialog } from "../components/AdvanceDialog.js";
import { CancelOrderDialog } from "../components/CancelOrderDialog.js";
import { CompleteOrderDialog } from "../components/CompleteOrderDialog.js";
import {
  orderActions,
  orderStatusLabels,
  remainingOf,
  advanceDateLabel,
} from "../components/orderLabels.js";
import { dueLabel } from "../ordersBoard.js";
import styles from "./OrderPages.module.css";

/// `/commandes/:id` (UI-14): summary, lines, advances and one action bar
/// with the permitted transitions only; the linked sale after completion.
export function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const permissions = useSessionPermissions();
  const toast = useToast();
  const query = useOrder(orderId);
  const changeStatus = useChangeOrderStatus();
  const [dialog, setDialog] = useState<
    "advance" | "complete" | "cancel" | null
  >(null);
  const order = query.data;

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

  if (!order) {
    return <Skeleton variant="table" rows={6} />;
  }

  const actions = orderActions(order, permissions);
  const open = order.status !== "COMPLETED" && order.status !== "CANCELLED";
  const lineColumns: DataTableColumn<OrderLine>[] = [
    {
      id: "product",
      header: "Produit",
      accessorFn: (row) => row.productNameSnapshot,
    },
    {
      id: "quantity",
      header: "Quantité",
      meta: { align: "right" },
      accessorFn: (row) => formatQuantity(row.quantity, row.unitNameSnapshot),
    },
    {
      id: "price",
      header: "Prix unitaire",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.unitPriceTnd),
    },
    {
      id: "total",
      header: "Total ligne",
      meta: { align: "right" },
      accessorFn: (row) => formatMoney(row.lineTotalTnd),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Ventes"
        title={order.reference}
        breadcrumbs={[
          { label: "Commandes", href: "/commandes" },
          { label: order.reference },
        ]}
        badge={
          <StatusPill
            status={order.status}
            label={orderStatusLabels[order.status]}
          />
        }
        actions={
          <div className={styles.actionBar}>
            {actions.advance ? (
              <Button
                leftIcon={<ArrowRight />}
                loading={changeStatus.isPending}
                onClick={() =>
                  changeStatus.mutate(
                    {
                      orderId: order.id,
                      version: order.version,
                      status: actions.advance?.status ?? "CONFIRMED",
                    },
                    {
                      onSuccess: (updated) =>
                        toast.success(
                          `Commande ${orderStatusLabels[updated.status].toLowerCase()}`,
                          updated.reference,
                        ),
                      onError: (error) => toast.fromError(error),
                    },
                  )
                }
              >
                {actions.advance.label}
              </Button>
            ) : null}
            {actions.resume ? (
              <Button
                variant="secondary"
                leftIcon={<Undo2 />}
                loading={changeStatus.isPending}
                onClick={() =>
                  changeStatus.mutate(
                    {
                      orderId: order.id,
                      version: order.version,
                      status: "PREPARING",
                    },
                    {
                      onSuccess: (updated) =>
                        toast.success(
                          `Commande ${orderStatusLabels[updated.status].toLowerCase()}`,
                          updated.reference,
                        ),
                      onError: (error) => toast.fromError(error),
                    },
                  )
                }
              >
                {actions.resume.label}
              </Button>
            ) : null}
            {actions.edit ? (
              <Button
                variant="secondary"
                leftIcon={<Pencil />}
                onClick={() => navigate(`/commandes/${order.id}/modifier`)}
              >
                Modifier
              </Button>
            ) : null}
            {actions.recordAdvance ? (
              <Button
                variant="secondary"
                leftIcon={<Banknote />}
                onClick={() => setDialog("advance")}
              >
                Encaisser un acompte
              </Button>
            ) : null}
            {actions.complete ? (
              <Button
                leftIcon={<Check />}
                onClick={() => setDialog("complete")}
              >
                Terminer
              </Button>
            ) : null}
            {actions.cancel ? (
              <Button
                variant="danger"
                leftIcon={<Ban />}
                onClick={() => setDialog("cancel")}
              >
                Annuler
              </Button>
            ) : null}
          </div>
        }
      />
      <div className={styles.summaryGrid}>
        <div className={styles.tabBody}>
          <Card>
            <CardHeader as="h2" title="Commande" />
            <KeyValueList
              columns={2}
              items={[
                {
                  label: "Client",
                  value: (
                    <Link to={`/clients/${order.customerId}`}>
                      {order.customer.name}
                    </Link>
                  ),
                },
                {
                  label: "Pour le",
                  value: `${formatDateTime(order.requestedFulfillmentAt)}${open ? ` (${dueLabel(order.requestedFulfillmentAt)})` : ""}`,
                },
                { label: "Créée le", value: formatDateTime(order.createdAt) },
                {
                  label: "Terminée le",
                  value: order.completedAt
                    ? formatDateTime(order.completedAt)
                    : null,
                },
                {
                  label: "Annulée le",
                  value: order.cancelledAt
                    ? formatDateTime(order.cancelledAt)
                    : null,
                },
                {
                  label: "Motif d'annulation",
                  value: order.cancellationReason,
                },
                {
                  label: "Sort de l'acompte",
                  value: order.advanceDisposition
                    ? order.advanceDisposition === "REFUNDED"
                      ? "Remboursé"
                      : "Conservé en avoir"
                    : null,
                },
                { label: "Notes", value: order.notes },
              ]}
            />
          </Card>
          <Card padding="none">
            <DataTable<OrderLine>
              label="Lignes de la commande"
              columns={lineColumns}
              data={order.lines ?? []}
              total={order.lines?.length ?? 0}
              page={1}
              pageSize={Math.max(order.lines?.length ?? 0, 1)}
              onChange={() => undefined}
              getRowId={(row) => row.id}
              empty={{ title: "Aucune ligne" }}
              mobileCard={(row) => (
                <>
                  <span className={styles.cardTop}>
                    <strong>{row.productNameSnapshot}</strong>
                    <span className="tabular-nums">
                      {formatMoney(row.lineTotalTnd)}
                    </span>
                  </span>
                  <span className={styles.muted}>
                    {formatQuantity(row.quantity, row.unitNameSnapshot)} ×{" "}
                    {formatMoney(row.unitPriceTnd)}
                  </span>
                </>
              )}
            />
          </Card>
          <Card>
            <CardHeader
              as="h2"
              title="Acomptes"
              description="Les avances reçues avant la remise ; elles ne sont pas du chiffre d'affaires."
            />
            {(order.advances ?? []).length === 0 ? (
              <p className={styles.muted}>Aucun acompte encaissé.</p>
            ) : (
              <KeyValueList
                items={(order.advances ?? []).map((row) => ({
                  label: `${row.movement === "REFUND" ? "Remboursement" : "Acompte"} du ${advanceDateLabel(row.paidAt)}`,
                  value: `${row.movement === "REFUND" ? "−" : ""}${formatMoney(row.amountTnd)}`,
                  numeric: true,
                }))}
              />
            )}
          </Card>
          {order.sale ? (
            <Card>
              <CardHeader
                as="h2"
                title="Vente liée"
                description="Créée à la remise de la commande ; le chiffre d'affaires est reconnu sur cette vente."
              />
              <KeyValueList
                columns={2}
                items={[
                  { label: "Référence", value: order.sale.reference },
                  {
                    label: "Vendue le",
                    value: formatDateTime(order.sale.soldAt),
                  },
                  {
                    label: "Total",
                    value: formatMoney(order.sale.totalTnd),
                    numeric: true,
                  },
                  {
                    label: "Payé",
                    value: formatMoney(order.sale.paidAmountTnd),
                    numeric: true,
                  },
                  {
                    label: "Reste à payer",
                    value: formatMoney(order.sale.remainingDueTnd),
                    numeric: true,
                  },
                ]}
              />
            </Card>
          ) : null}
        </div>
        <div className={styles.tabBody}>
          <Card>
            <CardHeader as="h2" title="Totaux" />
            <TotalsCard
              totalTnd={order.totalTnd}
              paidTnd={
                order.sale ? order.sale.paidAmountTnd : order.advanceReceivedTnd
              }
              remainingTnd={remainingOf(order)}
            />
          </Card>
        </div>
      </div>
      <AdvanceDialog
        open={dialog === "advance"}
        onOpenChange={(next) => setDialog(next ? "advance" : null)}
        order={order}
      />
      <CompleteOrderDialog
        open={dialog === "complete"}
        order={order}
        onCompleted={(completed) => {
          toast.success(
            "Commande terminée",
            completed.sale
              ? `Vente ${completed.sale.reference} créée.`
              : completed.reference,
          );
          setDialog(null);
        }}
        onCancel={() => setDialog(null)}
      />
      <CancelOrderDialog
        open={dialog === "cancel"}
        order={order}
        onCancelled={(cancelled) => {
          toast.success("Commande annulée", cancelled.reference);
          setDialog(null);
        }}
        onClose={() => setDialog(null)}
      />
    </>
  );
}
