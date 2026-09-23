import type { DocumentStatus } from "../../../components/ui/StatusPill/StatusPill.js";
import type {
  PurchasePaymentTerms,
  SupplierPaymentState,
  SupplierStatement,
} from "../procurement.api.js";

export const paymentTermsLabels: Record<PurchasePaymentTerms, string> = {
  PAID: "Payé",
  PARTIAL: "Partiel",
  UNPAID: "Impayé",
};

/// Payment state to the pill vocabulary: a partially paid purchase reads
/// "Partiel", never the raw key.
export function paymentStatePill(state: SupplierPaymentState): {
  status: DocumentStatus;
  label?: string;
} {
  switch (state) {
    case "PARTIALLY_PAID":
      return { status: "PARTIAL" };
    case "OVERDUE":
      return { status: "OVERDUE" };
    case "PAID":
      return { status: "PAID" };
    case "CANCELLED":
      return { status: "CANCELLED" };
    default:
      return { status: "UNPAID" };
  }
}

export const ledgerEntryLabels: Record<
  SupplierStatement["ledgerEntries"][number]["entryType"],
  string
> = {
  PURCHASE_PAYABLE: "Achat validé",
  PAYMENT: "Paiement",
  PURCHASE_REVERSAL: "Annulation d'achat",
  PAYMENT_REVERSAL: "Annulation de paiement",
};

/// Line snapshots keep the unit name ("Kilogramme"); the symbol reads better
/// in a sentence when it is known.
export function unitSymbolOf(name: string): string {
  const symbols: Record<string, string> = {
    Kilogramme: "kg",
    Gramme: "g",
    Litre: "L",
    Pièce: "pièce",
  };
  return symbols[name] ?? name;
}
