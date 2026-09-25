import { ConfirmPostingDialog } from "../../../components/patterns/ConfirmPostingDialog/ConfirmPostingDialog.js";
import {
  formatDateTime,
  formatMoney,
  formatQuantity,
} from "../../../i18n/format.js";
import { fr } from "../../../i18n/fr.js";
import {
  useCreateOrder,
  useRecordAdvance,
} from "../../orders/orders.queries.js";
import { cartTotal, safeDecimal, useCartStore } from "../cart.store.js";
import type { Sale } from "../pos.api.js";
import { usePostSale } from "../pos.queries.js";

export interface SaleConfirmDialogProps {
  open: boolean;
  onSold: (sale: Sale) => void;
  onOrdered: (orderId: string, reference: string) => void;
  onCancel: () => void;
}

/// The one confirmation before money moves (07 section 4.6, AS-019): a
/// compact summary, then the command with the cart's own idempotency key,
/// reused on every retry until the cart is cleared, so a lost response can
/// never post twice.
export function SaleConfirmDialog({
  open,
  onSold,
  onOrdered,
  onCancel,
}: SaleConfirmDialogProps) {
  const cart = useCartStore();
  const postSale = usePostSale();
  const createOrder = useCreateOrder();
  const recordAdvance = useRecordAdvance();
  const total = cartTotal(cart.lines);
  const paid =
    cart.mode === "SALE"
      ? cart.paidAmountTnd.trim() === ""
        ? total
        : safeDecimal(cart.paidAmountTnd)
      : safeDecimal(cart.advanceTnd);
  const remaining = total.minus(paid);
  const isOrder = cart.mode === "ORDER";

  return (
    <ConfirmPostingDialog
      open={open}
      title={isOrder ? "Enregistrer la commande" : "Encaisser la vente"}
      confirmLabel={isOrder ? "Enregistrer" : fr.post}
      impact={
        <ul>
          <li>
            {cart.lines.length} article{cart.lines.length > 1 ? "s" : ""} :{" "}
            {cart.lines
              .map(
                (line) =>
                  `${formatQuantity(line.quantity, line.unitSymbol)} ${line.name}`,
              )
              .join(", ")}
            .
          </li>
          <li>Total : {formatMoney(total.toFixed(3))}.</li>
          <li>Client : {cart.customer?.name ?? "client de passage"}.</li>
          {isOrder ? (
            <>
              <li>
                Retrait le{" "}
                {cart.fulfillmentAt
                  ? formatDateTime(new Date(cart.fulfillmentAt))
                  : "—"}
                .
              </li>
              <li>
                {paid.greaterThan(0)
                  ? `Acompte encaissé maintenant : ${formatMoney(paid.toFixed(3))}.`
                  : "Aucun acompte."}
              </li>
              <li>
                Aucun stock ni chiffre d'affaires avant la remise de la
                commande.
              </li>
            </>
          ) : (
            <>
              <li>
                Encaissé :{" "}
                {formatMoney(
                  paid.greaterThan(total) ? total.toFixed(3) : paid.toFixed(3),
                )}
                .
              </li>
              {remaining.greaterThan(0) ? (
                <li>
                  Reste à payer porté au compte client :{" "}
                  {formatMoney(remaining.toFixed(3))}.
                </li>
              ) : null}
              {remaining.lessThan(0) ? (
                <li>
                  Monnaie à rendre : {formatMoney(remaining.abs().toFixed(3))}.
                </li>
              ) : null}
              <li>
                Le stock des produits suivis diminue et le chiffre d'affaires
                est reconnu une seule fois.
              </li>
            </>
          )}
        </ul>
      }
      onPost={async () => {
        if (isOrder) {
          const order = await createOrder.mutateAsync({
            idempotencyKey: cart.intentKey,
            body: {
              customerId: cart.customer?.id ?? "",
              requestedFulfillmentAt: new Date(
                cart.fulfillmentAt,
              ).toISOString(),
              lines: cart.lines.map((line) => ({
                productId: line.productId,
                quantity: line.quantity,
              })),
            },
          });
          if (paid.greaterThan(0)) {
            await recordAdvance.mutateAsync({
              orderId: order.id,
              body: {
                amountTnd: paid.toFixed(3),
                paidAt: new Date().toISOString(),
              },
              idempotencyKey: cart.advanceKey,
            });
          }
          onOrdered(order.id, order.reference);
          return;
        }
        const sale = await postSale.mutateAsync({
          idempotencyKey: cart.intentKey,
          body: {
            customerId: cart.customer?.id,
            paidAmountTnd: paid.greaterThan(total)
              ? total.toFixed(3)
              : paid.toFixed(3),
            lines: cart.lines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
            })),
          },
        });
        onSold(sale);
      }}
      onCancel={onCancel}
    />
  );
}
