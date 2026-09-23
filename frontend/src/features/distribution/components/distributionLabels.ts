import type { DocumentStatus } from "../../../components/ui/StatusPill/StatusPill.js";
import type { SalePaymentState } from "../../customers/customers.api.js";
import type { DistributorStatement } from "../distribution.api.js";

export function paymentStatePill(state: SalePaymentState): {
  status: DocumentStatus;
  label: string;
} {
  return state === "PAID"
    ? { status: "PAID", label: "Payé" }
    : state === "PARTIALLY_PAID"
      ? { status: "PARTIAL", label: "Partiel" }
      : { status: "UNPAID", label: "Impayé" };
}

export function dispatchStatusPill(status: "OPEN" | "CLOSED"): {
  status: DocumentStatus;
  label: string;
} {
  return status === "OPEN"
    ? { status: "HELD", label: "Ouverte" }
    : { status: "SETTLED", label: "Réglée" };
}

export const ledgerEntryLabels: Record<
  DistributorStatement["ledgerEntries"][number]["entryType"],
  string
> = {
  SALE_RECEIVABLE: "Vente directe",
  SETTLEMENT_RECEIVABLE: "Règlement de dépôt-vente",
  PAYMENT: "Paiement",
  SALE_REVERSAL: "Annulation de vente",
  PAYMENT_REVERSAL: "Annulation de paiement",
};
