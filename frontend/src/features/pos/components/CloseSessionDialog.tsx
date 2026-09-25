import Decimal from "decimal.js-light";
import { useState } from "react";
import { ConfirmPostingDialog } from "../../../components/patterns/ConfirmPostingDialog/ConfirmPostingDialog.js";
import { KeyValueList } from "../../../components/patterns/KeyValueList/KeyValueList.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { MoneyInput } from "../../../components/ui/MoneyInput/MoneyInput.js";
import { Skeleton } from "../../../components/ui/Skeleton/Skeleton.js";
import { TextArea } from "../../../components/ui/TextArea/TextArea.js";
import { cx } from "../../../lib/cx.js";
import { formatMoney } from "../../../i18n/format.js";
import type { PosSession, SessionTotals } from "../pos.api.js";
import { useCloseSession, useSessionDetail } from "../pos.queries.js";
import { safeDecimal } from "../cart.store.js";
import styles from "./PosComponents.module.css";

export interface CloseSessionDialogProps {
  open: boolean;
  session: PosSession;
  onClosed: (session: PosSession) => void;
  onCancel: () => void;
}

/// Expected cash as the source of truth defines it (section 11.1): float,
/// plus cash taken on sales and order advances, minus advance refunds, plus
/// customer payments collected at the till.
export function expectedCash(
  session: Pick<PosSession, "openingCashTnd">,
  totals: SessionTotals,
): Decimal {
  return new Decimal(session.openingCashTnd)
    .plus(totals.cashCollectedTnd)
    .plus(totals.advancesReceivedTnd)
    .minus(totals.advancesRefundedTnd)
    .plus(totals.customerPaymentsTnd)
    .minus(totals.customerPaymentReversalsTnd)
    .toDecimalPlaces(3);
}

/// "Clôturer la caisse" (POS-006): expected cash from the session totals,
/// the counted cash, the live difference in colour, and a confirmation that
/// says the difference is recorded as is.
export function CloseSessionDialog({
  open,
  session,
  onClosed,
  onCancel,
}: CloseSessionDialogProps) {
  const detail = useSessionDetail(session.id, { enabled: open });
  const close = useCloseSession();
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const expected = detail.data
    ? expectedCash(detail.data.session, detail.data.totals)
    : null;
  const difference = expected ? safeDecimal(counted).minus(expected) : null;
  const countedValid = /^\d+([.,]\d{1,3})?$/.test(counted.trim());

  return (
    <ConfirmPostingDialog
      open={open}
      title="Clôturer la caisse"
      confirmLabel="Clôturer"
      impact={
        <div className={styles.closeBody}>
          {!detail.data || !expected ? (
            <Skeleton variant="kpi" />
          ) : (
            <KeyValueList
              items={[
                {
                  label: "Fonds de caisse",
                  value: formatMoney(session.openingCashTnd),
                  numeric: true,
                },
                {
                  label: "Espèces encaissées sur ventes",
                  value: formatMoney(detail.data.totals.cashCollectedTnd),
                  numeric: true,
                },
                {
                  label: "Acomptes encaissés",
                  value: formatMoney(detail.data.totals.advancesReceivedTnd),
                  numeric: true,
                },
                {
                  label: "Acomptes remboursés",
                  value: `−${formatMoney(detail.data.totals.advancesRefundedTnd)}`,
                  numeric: true,
                },
                {
                  label: "Règlements clients à la caisse",
                  value: formatMoney(detail.data.totals.customerPaymentsTnd),
                  numeric: true,
                },
                {
                  label: "Règlements clients annulés",
                  value: `−${formatMoney(detail.data.totals.customerPaymentReversalsTnd)}`,
                  numeric: true,
                },
                {
                  label: "Espèces attendues",
                  value: <strong>{formatMoney(expected.toFixed(3))}</strong>,
                  numeric: true,
                },
              ]}
            />
          )}
          <FormField
            label="Espèces comptées"
            required
            error={
              counted && !countedValid
                ? "Saisissez un montant avec au plus 3 décimales."
                : undefined
            }
          >
            <MoneyInput
              value={counted}
              onChange={setCounted}
              invalid={Boolean(counted) && !countedValid}
            />
          </FormField>
          <div
            className={cx(
              styles.difference,
              difference &&
                !difference.isZero() &&
                (difference.lessThan(0) ? styles.short : styles.over),
            )}
            aria-live="polite"
          >
            <span>Écart</span>
            <strong className="tabular-nums">
              {difference && countedValid
                ? `${difference.greaterThan(0) ? "+" : difference.lessThan(0) ? "−" : ""}${formatMoney(difference.abs().toFixed(3))}`
                : "—"}
            </strong>
          </div>
          <FormField label="Notes" hint="Expliquez l'écart si besoin.">
            <TextArea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
            />
          </FormField>
          <p className={styles.hint}>
            L'écart est enregistré tel quel dans l'historique des sessions ;
            aucune vente ne pourra plus être saisie sur cette session.
          </p>
        </div>
      }
      onPost={async (idempotencyKey) => {
        if (!countedValid) {
          throw new Error("Saisissez les espèces comptées.");
        }
        const closed = await close.mutateAsync({
          sessionId: session.id,
          body: {
            countedCashTnd: counted.replace(",", "."),
            notes: notes || undefined,
          },
          idempotencyKey,
        });
        onClosed(closed);
      }}
      onCancel={onCancel}
    />
  );
}
