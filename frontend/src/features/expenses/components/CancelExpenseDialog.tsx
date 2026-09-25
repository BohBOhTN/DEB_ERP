import { ConfirmDialog } from "../../../components/ui/ConfirmDialog/ConfirmDialog.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { formatMoney } from "../../../i18n/format.js";
import type { Expense } from "../expenses.api.js";
import { useCancelExpense } from "../expenses.queries.js";

export interface CancelExpenseDialogProps {
  expense: Expense | null;
  onClose: () => void;
}

/// Cancellation with a mandatory reason (EXP-007, EXP-008, AS-017): the
/// expense leaves every active total and stays in history; the command
/// carries the version, so a stale row is refused rather than cancelled twice.
export function CancelExpenseDialog({
  expense,
  onClose,
}: CancelExpenseDialogProps) {
  const toast = useToast();
  const cancel = useCancelExpense();

  return (
    <ConfirmDialog
      open={expense !== null}
      title={expense ? `Annuler ${expense.reference}` : "Annuler la dépense"}
      tone="danger"
      confirmLabel="Annuler la dépense"
      requireReason
      loading={cancel.isPending}
      impact={
        <ul>
          <li>
            La dépense{expense ? ` de ${formatMoney(expense.amountTnd)}` : ""}{" "}
            sera exclue des totaux et restera visible dans l'historique.
          </li>
          <li>Le motif, l'auteur et l'heure de l'annulation sont conservés.</li>
        </ul>
      }
      onConfirm={(reason) => {
        if (!expense) return;
        cancel.mutate(
          {
            expenseId: expense.id,
            version: expense.version,
            reason: reason ?? "",
          },
          {
            onSuccess: (cancelled) => {
              toast.success("Dépense annulée", cancelled.reference);
              onClose();
            },
            onError: (error) => toast.fromError(error),
          },
        );
      }}
      onCancel={onClose}
    />
  );
}
