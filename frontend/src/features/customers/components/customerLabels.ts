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

export const customerLedgerLabels: Record<string, string> = {
  SALE_RECEIVABLE: "Vente à crédit",
  CUSTOMER_PAYMENT: "Règlement client",
  ORDER_ADVANCE: "Acompte sur commande",
  ORDER_ADVANCE_APPLIED: "Acompte appliqué",
  ORDER_ADVANCE_REFUNDED: "Acompte remboursé",
  ORDER_ADVANCE_CREDITED: "Acompte converti en avoir",
  CUSTOMER_CREDIT: "Avoir client",
};

export function ledgerLabel(entryType: CustomerLedgerEntryType): string {
  return (
    customerLedgerLabels[entryType] ??
    entryType.replace(/_/g, " ").toLowerCase()
  );
}
