import { Ban, Banknote, Eye, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DropdownMenu } from "../../../components/ui/DropdownMenu/DropdownMenu.js";
import { IconButton } from "../../../components/ui/IconButton/IconButton.js";
import { useToast } from "../../../components/ui/Toast/useToast.js";
import { formatMoney } from "../../../i18n/format.js";
import type { PermissionSet } from "../../../lib/auth/permissions.js";
import { CustomerPaymentDialog } from "../../customers/components/CustomerPaymentDialog.js";
import type { Sale } from "../pos.api.js";
import { useSale } from "../pos.queries.js";
import { CancelSaleDialog } from "./CancelSaleDialog.js";

export interface SaleRowActionsProps {
  sale: Sale;
  permissions: PermissionSet;
  /// Hide "Voir" when the actions sit on the receipt itself.
  onReceipt?: boolean;
}

/// What can be done with a sale (issue #44): open the receipt, collect the
/// remainder of a credit sale through the customer's règlement dialog
/// (prefilled and capped by the sale's balance), or cancel it. Only a posted
/// sale offers the last two.
export function SaleRowActions({
  sale,
  permissions,
  onReceipt = false,
}: SaleRowActionsProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [dialog, setDialog] = useState<"pay" | "cancel" | null>(null);
  // The cancel dialog lists the lines, which the list rows do not carry.
  const detail = useSale(dialog === "cancel" && !sale.lines ? sale.id : "");
  const full = sale.lines ? sale : detail.data;
  const posted = sale.status === "POSTED";
  const canPay =
    posted &&
    sale.customer !== null &&
    Number(sale.remainingDueTnd) > 0 &&
    permissions.has("customer_payments.create");
  const canCancel = posted && permissions.has("pos.cancel_sale");

  if (!canPay && !canCancel && onReceipt) {
    return null;
  }

  return (
    <>
      <DropdownMenu
        label={`Actions ${sale.reference}`}
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
            onSelect: () => navigate(`/caisse/ventes/${sale.id}`),
            hidden: onReceipt,
          },
          {
            id: "pay",
            label: "Encaisser le reste",
            icon: <Banknote />,
            onSelect: () => setDialog("pay"),
            hidden: !canPay,
          },
          {
            id: "cancel",
            label: "Annuler",
            icon: <Ban />,
            onSelect: () => setDialog("cancel"),
            hidden: !canCancel,
          },
        ]}
      />
      {sale.customer ? (
        <CustomerPaymentDialog
          open={dialog === "pay"}
          onOpenChange={(next) => setDialog(next ? "pay" : null)}
          customer={{ id: sale.customer.id, name: sale.customer.name }}
          saleId={sale.id}
        />
      ) : null}
      {full ? (
        <CancelSaleDialog
          open={dialog === "cancel"}
          sale={full}
          onCancelled={(cancelled) => {
            toast.success(
              "Vente annulée",
              `${cancelled.reference} · ${formatMoney(cancelled.totalTnd)}.`,
            );
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}
