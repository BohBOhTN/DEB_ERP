import type { DocumentStatus } from "../../../components/ui/StatusPill/StatusPill.js";
import type { ExpenseStatus } from "../expenses.api.js";

/// Expense statuses in the feminine the spec uses (07 section 4.8).
export function expenseStatusPill(status: ExpenseStatus): {
  status: DocumentStatus;
  label: string;
} {
  return status === "POSTED"
    ? { status: "POSTED", label: "Validée" }
    : status === "CANCELLED"
      ? { status: "CANCELLED", label: "Annulée" }
      : { status: "DRAFT", label: "Brouillon" };
}
