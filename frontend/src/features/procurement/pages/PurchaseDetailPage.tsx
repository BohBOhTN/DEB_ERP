import { Ban, Check, Pencil } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConfirmPostingDialog } from "../../../components/patterns/ConfirmPostingDialog/ConfirmPostingDialog.js";
import {
  DataTable,
  type DataTableColumn,
} from "../../../components/patterns/DataTable/DataTable.js";
import { KeyValueList } from "../../../components/patterns/KeyValueList/KeyValueList.js";
import { PageHeader } from "../../../components/patterns/PageHeader/PageHeader.js";
import { PermissionGate } from "../../../components/patterns/PermissionGate/PermissionGate.js";
import { TotalsCard } from "../../../components/patterns/TotalsCard/TotalsCard.js";
import { Badge } from "../../../components/ui/Badge/Badge.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { Card, CardHeader } from "../../../components/ui/Card/Card.js";
import { ErrorState } from "../../../components/ui/ErrorState/ErrorState.js";
import { Skeleton } from "../../../components/ui/Skeleton/Skeleton.js";
import { StatusPill } from "../../../components/ui/StatusPill/StatusPill.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { describeError } from "../../../i18n/errors.js";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatQuantity,
} from "../../../i18n/format.js";
import { useSessionPermissions } from "../../../app/sessionContext.js";
import type { PurchaseLine } from "../procurement.api.js";
import { useCancelPurchase, usePurchase } from "../procurement.queries.js";
import {
  paymentStatePill,
  paymentTermsLabels,
  unitSymbolOf,
} from "../components/procurementLabels.js";
import { PostPurchaseDialog } from "../components/PostPurchaseDialog.js";
import { paidOf } from "./PurchasesPage.js";
import styles from "./ProcurementPages.module.css";

/// `/achats/:id` (UI-12): summary, lines, payments and the ledger effect,
/// with Valider on a draft, Modifier on a draft and Annuler with a reason on
/// a posted purchase.
export function PurchaseDetailPage() {
  const { purchaseId = "" } = useParams();
  const permissions = useSessionPermissions();
  const navigate = useNavigate();
  const toast = useToast();
  const query = usePurchase(purchaseId);
  const cancel = useCancelPurchase();
  const [posting, setPosting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const purchase = query.data;

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

  if (!purchase) {
    return <Skeleton variant="table" rows={6} />;
  }

  const title = purchase.reference ?? "Brouillon d'achat";
  const paid = paidOf(purchase);
  const lineColumns: DataTableColumn<PurchaseLine>[] = [
    {
      id: "material",
      header: "Matière première",
      accessorFn: (row) => row.rawMaterialNameSnapshot,
    },
    {
      id: "quantity",
      header: "Quantité",
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className={styles.bigNumber}>
          <span className="tabular-nums">
            {formatQuantity(
              row.original.enteredQuantity,
              row.original.enteredUnitNameSnapshot,
            )}
          </span>
          {row.original.enteredUnitId !== row.original.baseUnitId ? (
            <span className={styles.muted}>
              ={" "}
              {formatQuantity(
                row.original.normalizedQuantity,
                row.original.baseUnitNameSnapshot,
              )}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "price",
      header: "Prix unitaire",
      meta: { align: "right" },
      accessorFn: (row) =>
        `${formatMoney(row.unitPriceTnd)} / ${row.baseUnitNameSnapshot}`,
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
        eyebrow="Achats"
        title={title}
        breadcrumbs={[{ label: "Achats", href: "/achats" }, { label: title }]}
        badge={
          <span className={styles.nameCell}>
            <StatusPill status={purchase.status} />
            {purchase.status === "POSTED" ? (
              <StatusPill {...paymentStatePill(purchase.paymentState)} />
            ) : null}
          </span>
        }
        actions={
          <>
            {purchase.status === "DRAFT" ? (
              <>
                <PermissionGate
                  permissions={permissions}
                  permission="purchases.post"
                >
                  <Button leftIcon={<Check />} onClick={() => setPosting(true)}>
                    Valider
                  </Button>
                </PermissionGate>
                <PermissionGate
                  permissions={permissions}
                  permission="purchases.create"
                >
                  <Button
                    variant="secondary"
                    leftIcon={<Pencil />}
                    onClick={() => navigate(`/achats/${purchase.id}/modifier`)}
                  >
                    Modifier
                  </Button>
                </PermissionGate>
              </>
            ) : null}
            {purchase.status === "POSTED" ? (
              <PermissionGate
                permissions={permissions}
                permission="purchases.cancel"
              >
                <Button
                  variant="danger"
                  leftIcon={<Ban />}
                  onClick={() => setCancelling(true)}
                >
                  Annuler
                </Button>
              </PermissionGate>
            ) : null}
          </>
        }
      />
      <div className={styles.summaryGrid}>
        <div className={styles.tabBody}>
          <Card>
            <CardHeader as="h2" title="Achat" />
            <KeyValueList
              columns={2}
              items={[
                {
                  label: "Fournisseur",
                  value: (
                    <Link to={`/fournisseurs/${purchase.supplierId}`}>
                      {purchase.supplier.name}
                    </Link>
                  ),
                },
                {
                  label: "Date d'achat",
                  value: formatDate(purchase.purchaseDate),
                },
                {
                  label: "Référence fournisseur",
                  value: purchase.supplierReference,
                },
                {
                  label: "Conditions",
                  value: paymentTermsLabels[purchase.paymentTerms],
                },
                {
                  label: "Échéance",
                  value: purchase.dueDate ? (
                    <span className={styles.dateCell}>
                      {formatDate(purchase.dueDate)}
                      {purchase.paymentState === "OVERDUE" ? (
                        <Badge tone="danger">En retard</Badge>
                      ) : null}
                    </span>
                  ) : null,
                },
                {
                  label: "Validé le",
                  value: purchase.postedAt
                    ? formatDateTime(purchase.postedAt)
                    : null,
                },
                {
                  label: "Annulé le",
                  value: purchase.cancelledAt
                    ? formatDateTime(purchase.cancelledAt)
                    : null,
                },
                {
                  label: "Motif d'annulation",
                  value: purchase.cancellationReason,
                },
                { label: "Notes", value: purchase.notes },
              ]}
            />
          </Card>
          <Card padding="none">
            <DataTable<PurchaseLine>
              label="Lignes de l'achat"
              columns={lineColumns}
              data={purchase.lines}
              total={purchase.lines.length}
              page={1}
              pageSize={Math.max(purchase.lines.length, 1)}
              onChange={() => undefined}
              getRowId={(row) => row.id}
              empty={{ title: "Aucune ligne" }}
              mobileCard={(row) => (
                <>
                  <span className={styles.cardTop}>
                    <strong>{row.rawMaterialNameSnapshot}</strong>
                    <span className="tabular-nums">
                      {formatMoney(row.lineTotalTnd)}
                    </span>
                  </span>
                  <span className={styles.muted}>
                    {formatQuantity(
                      row.enteredQuantity,
                      row.enteredUnitNameSnapshot,
                    )}
                    {row.enteredUnitId !== row.baseUnitId
                      ? ` = ${formatQuantity(row.normalizedQuantity, row.baseUnitNameSnapshot)}`
                      : ""}{" "}
                    · {formatMoney(row.unitPriceTnd)} /{" "}
                    {row.baseUnitNameSnapshot}
                  </span>
                </>
              )}
            />
          </Card>
          {purchase.status === "POSTED" ? (
            <Card>
              <CardHeader
                as="h2"
                title="Paiements"
                description="Le paiement enregistré à la validation et les affectations ultérieures."
              />
              {(purchase.payments ?? []).length === 0 ? (
                <p className={styles.muted}>
                  Aucun paiement enregistré à la validation. Les paiements
                  affectés apparaissent dans le relevé du fournisseur.
                </p>
              ) : (
                <KeyValueList
                  items={(purchase.payments ?? []).map((payment) => ({
                    label: formatDateTime(payment.paidAt),
                    value: `${formatMoney(payment.amountTnd)}${payment.reference ? ` · ${payment.reference}` : ""}`,
                    numeric: true,
                  }))}
                />
              )}
            </Card>
          ) : null}
        </div>
        <div className={styles.tabBody}>
          <Card>
            <CardHeader as="h2" title="Totaux" />
            <TotalsCard
              totalTnd={purchase.totalTnd}
              paidTnd={paid}
              remainingTnd={
                purchase.status === "POSTED"
                  ? purchase.balanceTnd
                  : (Number(purchase.totalTnd) - Number(paid)).toFixed(3)
              }
              provisional={purchase.status === "DRAFT"}
            />
          </Card>
        </div>
      </div>
      <PostPurchaseDialog
        open={posting}
        purchase={posting ? purchase : null}
        onPosted={(posted) => {
          toast.success(
            "Achat validé",
            `${posted.reference ?? ""} · ${posted.supplier.name}`.trim(),
          );
          setPosting(false);
        }}
        onCancel={() => setPosting(false)}
      />
      <ConfirmPostingDialog
        open={cancelling}
        title={`Annuler ${title}`}
        tone="danger"
        confirmLabel="Annuler l'achat"
        requireReason
        impact={
          <ul>
            <li>
              Stock :{" "}
              {purchase.lines
                .map(
                  (line) =>
                    `−${formatQuantity(line.normalizedQuantity, unitSymbolOf(line.baseUnitNameSnapshot))} ${line.rawMaterialNameSnapshot}`,
                )
                .join(", ")}
              .
            </li>
            <li>
              Dette fournisseur : le reste dû de{" "}
              {formatMoney(purchase.balanceTnd)} est annulé
              {Number(paid) > 0
                ? ` et le paiement de ${formatMoney(paid)} est contre-passé`
                : ""}
              .
            </li>
            <li>L'achat reste consultable avec son motif d'annulation.</li>
          </ul>
        }
        onPost={async (idempotencyKey, reason) => {
          await cancel.mutateAsync({
            purchaseId: purchase.id,
            reason: reason ?? "",
            idempotencyKey,
          });
        }}
        onPosted={() => {
          toast.success("Achat annulé", title);
          setCancelling(false);
        }}
        onCancel={() => setCancelling(false)}
      />
    </>
  );
}
