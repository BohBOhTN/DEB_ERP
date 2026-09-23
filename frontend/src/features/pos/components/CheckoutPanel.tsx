import { forwardRef } from "react";
import { PaymentBox } from "../../../components/patterns/PaymentBox/PaymentBox.js";
import { TotalsCard } from "../../../components/patterns/TotalsCard/TotalsCard.js";
import { Button } from "../../../components/ui/Button/Button.js";
import { DateTimeInput } from "../../../components/ui/DateTimeInput/DateTimeInput.js";
import { FormField } from "../../../components/ui/FormField/FormField.js";
import { Kbd } from "../../../components/ui/Kbd/Kbd.js";
import { MoneyInput } from "../../../components/ui/MoneyInput/MoneyInput.js";
import { SegmentedControl } from "../../../components/ui/SegmentedControl/SegmentedControl.js";
import { cx } from "../../../lib/cx.js";
import type { PermissionSet } from "../../../lib/auth/permissions.js";
import { formatMoney } from "../../../i18n/format.js";
import {
  cartTotal,
  safeDecimal,
  useCartStore,
  type CartMode,
} from "../cart.store.js";
import { PosCustomerCombobox } from "./PosCustomerCombobox.js";
import styles from "./PosComponents.module.css";

export interface CheckoutBlocker {
  reason: string;
}

/// Why "Encaisser" is disabled, in French, or null when the cart can be
/// posted (POS-010, POS-011, ORD-003, ORD-004).
export function checkoutBlocker(
  state: {
    lines: unknown[];
    mode: CartMode;
    customer: unknown;
    paidAmountTnd: string;
    fulfillmentAt: string;
    advanceTnd: string;
  },
  total: string,
  permissions: PermissionSet,
): string | null {
  if (state.lines.length === 0) return "Ajoutez au moins un article.";
  if (state.mode === "ORDER") {
    if (!state.customer) return "Une commande exige un client enregistré.";
    if (
      !state.fulfillmentAt ||
      new Date(state.fulfillmentAt).getTime() <= Date.now()
    )
      return "Indiquez une date de retrait dans le futur.";
    if (
      state.advanceTnd.trim() !== "" &&
      safeDecimal(state.advanceTnd).greaterThan(total)
    )
      return "L'acompte dépasse le total de la commande.";
    return null;
  }
  const paid =
    state.paidAmountTnd.trim() === ""
      ? safeDecimal(total)
      : safeDecimal(state.paidAmountTnd);
  if (paid.lessThan(total)) {
    if (!state.customer)
      return "Un client enregistré est obligatoire pour une vente à crédit.";
    if (!permissions.has("pos.credit_sale"))
      return "Vous n'avez pas l'autorisation d'enregistrer une vente à crédit.";
  }
  return null;
}

export interface CheckoutPanelProps {
  permissions: PermissionSet;
  onCheckout: () => void;
  showShortcuts?: boolean;
}

/// Mode, customer, totals and payment (07 section 4.6): the button explains
/// why it is disabled instead of staying silent.
export const CheckoutPanel = forwardRef<HTMLButtonElement, CheckoutPanelProps>(
  function CheckoutPanel(
    { permissions, onCheckout, showShortcuts = false },
    customerRef,
  ) {
    const cart = useCartStore();
    const total = cartTotal(cart.lines).toFixed(3);
    const paid =
      cart.paidAmountTnd.trim() === ""
        ? safeDecimal(total)
        : safeDecimal(cart.paidAmountTnd);
    const remaining = safeDecimal(total).minus(paid);
    const blocker = checkoutBlocker(cart, total, permissions);
    const canOrder = permissions.has("orders.create");

    return (
      <div className={styles.checkout}>
        {canOrder ? (
          <FormField label="Type" labelIsElement={false}>
            <SegmentedControl<CartMode>
              label="Type d'opération"
              fullWidth
              value={cart.mode}
              onValueChange={cart.setMode}
              options={[
                { value: "SALE", label: "Vente directe" },
                { value: "ORDER", label: "Commande" },
              ]}
            />
          </FormField>
        ) : null}
        <FormField
          label="Client"
          hint={
            cart.mode === "SALE"
              ? "Facultatif pour une vente payée en totalité."
              : undefined
          }
        >
          <PosCustomerCombobox
            value={
              cart.customer
                ? { value: cart.customer.id, label: cart.customer.name }
                : null
            }
            onChange={(option) =>
              cart.setCustomer(
                option ? { id: option.value, name: option.label } : null,
              )
            }
          />
        </FormField>
        <span ref={customerRef} hidden />
        {cart.mode === "ORDER" ? (
          <>
            <FormField label="Retrait le" required>
              <DateTimeInput
                value={cart.fulfillmentAt}
                onChange={cart.setFulfillmentAt}
              />
            </FormField>
            <TotalsCard
              totalTnd={total}
              paidTnd={safeDecimal(cart.advanceTnd).toFixed(3)}
              remainingTnd={
                safeDecimal(total)
                  .minus(safeDecimal(cart.advanceTnd))
                  .greaterThan(0)
                  ? safeDecimal(total)
                      .minus(safeDecimal(cart.advanceTnd))
                      .toFixed(3)
                  : "0"
              }
              provisional
            />
            <FormField
              label="Acompte"
              hint="Encaissé maintenant dans la caisse ouverte, facultatif."
            >
              <MoneyInput value={cart.advanceTnd} onChange={cart.setAdvance} />
            </FormField>
          </>
        ) : (
          <>
            <TotalsCard
              totalTnd={total}
              paidTnd={paid.toFixed(3)}
              remainingTnd={
                remaining.greaterThan(0) ? remaining.toFixed(3) : "0"
              }
              provisional
            />
            <PaymentBox
              dueTnd={total}
              amountTnd={cart.paidAmountTnd}
              onAmountChange={cart.setPaidAmount}
              allowOverpayment
            />
            {remaining.greaterThan(0) ? (
              <p className={styles.creditNote} role="status">
                {cart.customer
                  ? `Vente à crédit : ${formatMoney(remaining.toFixed(3))} seront portés au compte de ${cart.customer.name}.`
                  : "Un reste à payer exige un client enregistré : choisissez le client ou complétez le paiement."}
              </p>
            ) : null}
          </>
        )}
        <Button
          className={cx(styles.payButton)}
          onClick={onCheckout}
          disabled={Boolean(blocker)}
          title={blocker ?? undefined}
          aria-describedby={blocker ? "checkout-blocker" : undefined}
        >
          {cart.mode === "ORDER" ? "Enregistrer la commande" : "Encaisser"}
        </Button>
        {blocker ? (
          <p id="checkout-blocker" className={styles.hint}>
            {blocker}
          </p>
        ) : null}
        {showShortcuts ? (
          <div className={styles.shortcuts} aria-label="Raccourcis clavier">
            <span>
              <Kbd>/</Kbd> recherche
            </span>
            <span>
              <Kbd>Entrée</Kbd> ajoute le premier résultat
            </span>
            <span>
              <Kbd>F2</Kbd> client
            </span>
            <span>
              <Kbd>F9</Kbd> encaisser
            </span>
            <span>
              <Kbd>Échap</Kbd> vider
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);
