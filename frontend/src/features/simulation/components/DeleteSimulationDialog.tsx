import { ConfirmDialog } from "../../../components/ui/ConfirmDialog/ConfirmDialog.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import type { CostSimulation } from "../simulation.api.js";
import { useDeleteSimulation } from "../simulation.queries.js";

export interface DeleteSimulationDialogProps {
  simulation: CostSimulation | null;
  onClose: () => void;
  onDeleted?: () => void;
}

/// Deleting a planning document (SIM-005): nothing operational depends on
/// it, so the impact is only the loss of the scenario.
export function DeleteSimulationDialog({
  simulation,
  onClose,
  onDeleted,
}: DeleteSimulationDialogProps) {
  const toast = useToast();
  const remove = useDeleteSimulation();

  return (
    <ConfirmDialog
      open={simulation !== null}
      title={
        simulation ? `Supprimer ${simulation.name}` : "Supprimer la simulation"
      }
      tone="danger"
      confirmLabel="Supprimer"
      loading={remove.isPending}
      impact={
        <p>
          La simulation et ses ingrédients seront supprimés. Aucun stock ni
          aucune écriture n'est concerné.
        </p>
      }
      onConfirm={() => {
        if (!simulation) return;
        remove.mutate(simulation.id, {
          onSuccess: () => {
            toast.success("Simulation supprimée", simulation.name);
            onClose();
            onDeleted?.();
          },
          onError: (error) => toast.fromError(error),
        });
      }}
      onCancel={onClose}
    />
  );
}
