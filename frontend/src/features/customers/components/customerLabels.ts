import type { DocumentStatus } from "../../../components/ui/StatusPill/StatusPill.js";
import type {
  CustomerLedgerEntryType,
  SalePaymentState,
} from "../customers.api.js";

export function salePaymentPill(state: SalePaymentState): {
  status: DocumentStatus;
} {
  return {
    status:
      state === "PARTIALLY_PAID"
        ? "PARTIAL"
        : state === "PAID"
          ? "PAID"
          : "UNPAID",
  };
}

/// One feminine label per payment state of a sale, shared by the sales
/// list, the receipt and the customer's sales tab (issue #44).
export function salePaymentStateLabel(state: SalePaymentState): string {
  return state === "PAID"
    ? "Payée"
    : state === "PARTIALLY_PAID"
      ? "Partielle"
      : "Impayée";
}

/// Keyed by the ledger entry types the backend writes.
export const customerLedgerLabels: Record<string, string> = {
  SALE_RECEIVABLE: "Vente à crédit",
  PAYMENT: "Règlement client",
  SALE_REVERSAL: "Vente annulée",
  PAYMENT_REVERSAL: "Règlement annulé",
  ORDER_ADVANCE: "Acompte sur commande",
  ORDER_ADVANCE_APPLIED: "Acompte appliqué",
  ORDER_ADVANCE_REFUNDED: "Acompte remboursé",
  ORDER_ADVANCE_CREDITED: "Acompte converti en avoir",
};

export function ledgerLabel(entryType: CustomerLedgerEntryType): string {
  return (
    customerLedgerLabels[entryType] ??
    entryType.replace(/_/g, " ").toLowerCase()
  );
}
