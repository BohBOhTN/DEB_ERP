import {
  ArrowRight,
  Ban,
  Banknote,
  Check,
  Eye,
  MoreHorizontal,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DropdownMenu } from "../../../components/ui/DropdownMenu/DropdownMenu.js";
import { IconButton } from "../../../components/ui/IconButton/IconButton.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import type { PermissionSet } from "../../../lib/auth/permissions.js";
import type { Order } from "../orders.api.js";
import { useChangeOrderStatus, useOrder } from "../orders.queries.js";
import { AdvanceDialog } from "./AdvanceDialog.js";
import { CancelOrderDialog } from "./CancelOrderDialog.js";
import { CompleteOrderDialog } from "./CompleteOrderDialog.js";
import { orderActions, orderStatusLabels } from "./orderLabels.js";

export interface OrderRowActionsProps {
  order: Order;
  permissions: PermissionSet;
}

type Dialog = "advance" | "complete" | "cancel";

/// The actions of the detail page, from a queue row (issue #45): view, the
/// next status, a deposit, completion and cancellation, each behind the
/// same permission and the same dialog as the page. The dialogs need the
/// lines and advances, so the detail is read when one opens.
export function OrderRowActions({ order, permissions }: OrderRowActionsProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const changeStatus = useChangeOrderStatus();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const detail = useOrder(order.id, { enabled: dialog !== null });
  const actions = orderActions(order, permissions);
  const full = detail.data;

  const transition = (status: "CONFIRMED" | "PREPARING" | "READY") =>
    changeStatus.mutate(
      { orderId: order.id, version: order.version, status },
      {
        onSuccess: (updated) =>
          toast.success(
            `Commande ${orderStatusLabels[updated.status].toLowerCase()}`,
            updated.reference,
          ),
        onError: (error) => toast.fromError(error),
      },
    );

  return (
    <>
      <DropdownMenu
        label={`Actions ${order.reference}`}
        trigger={
          <IconButton
            label="Actions"
            icon={<MoreHorizontal />}
            variant="ghost"
            size="sm"
          />
        }
        items={[
          {
            id: "view",
            label: "Voir",
            icon: <Eye />,
            onSelect: () => navigate(`/commandes/${order.id}`),
          },
          {
            id: "advance",
            label: actions.advance?.label ?? "",
            icon: <ArrowRight />,
            onSelect: () =>
              actions.advance && transition(actions.advance.status),
            hidden: !actions.advance,
          },
          {
            id: "resume",
            label: actions.resume?.label ?? "",
            icon: <Undo2 />,
            onSelect: () => transition("PREPARING"),
            hidden: !actions.resume,
          },
          {
            id: "deposit",
            label: "Encaisser un acompte",
            icon: <Banknote />,
            onSelect: () => setDialog("advance"),
            hidden: !actions.recordAdvance,
          },
          {
            id: "complete",
            label: "Terminer",
            icon: <Check />,
            onSelect: () => setDialog("complete"),
            hidden: !actions.complete,
          },
          {
            id: "cancel",
            label: "Annuler",
            icon: <Ban />,
            onSelect: () => setDialog("cancel"),
            hidden: !actions.cancel,
          },
        ]}
      />
      {full ? (
        <>
          <AdvanceDialog
            open={dialog === "advance"}
            onOpenChange={(next) => setDialog(next ? "advance" : null)}
            order={full}
          />
          <CompleteOrderDialog
            open={dialog === "complete"}
            order={full}
            onCompleted={(completed) => {
              toast.success(
                "Commande terminée",
                completed.sale
                  ? `Vente ${completed.sale.reference} créée.`
                  : completed.reference,
              );
              setDialog(null);
            }}
            onCancel={() => setDialog(null)}
          />
          <CancelOrderDialog
            open={dialog === "cancel"}
            order={full}
            onCancelled={(cancelled) => {
              toast.success("Commande annulée", cancelled.reference);
              setDialog(null);
            }}
            onClose={() => setDialog(null)}
          />
        </>
      ) : null}
    </>
  );
}
