import type {
  InventoryMovementType,
  InventorySourceType,
} from "./inventory.api.js";

/// French labels for the movement vocabulary (07 section 4.2); the raw enum
/// never reaches the screen.
export const movementTypeLabels: Record<InventoryMovementType, string> = {
  OPENING_STOCK: "Stock d'ouverture",
  PURCHASE_RECEIPT: "Entrée achat",
  POS_SALE: "Vente",
  ORDER_SALE: "Vente sur commande",
  DISTRIBUTOR_DIRECT_SALE: "Vente directe distributeur",
  DISTRIBUTOR_DISPATCH_OUT: "Sortie dépôt-vente",
  DISTRIBUTOR_RETURN_IN: "Retour dépôt-vente",
  DISTRIBUTOR_SETTLED_SALE: "Vente en dépôt réglée",
  STOCK_ADJUSTMENT_INCREASE: "Ajustement (entrée)",
  STOCK_ADJUSTMENT_DECREASE: "Ajustement (sortie)",
  REVERSAL: "Annulation",
};

export const sourceTypeLabels: Record<InventorySourceType, string> = {
  OPENING_STOCK: "Stock d'ouverture",
  STOCK_ADJUSTMENT: "Ajustement",
  PURCHASE: "Achat",
  PURCHASE_CANCELLATION: "Annulation d'achat",
  POS_SALE: "Vente en caisse",
  CUSTOMER_ORDER_SALE: "Commande client",
  DISTRIBUTOR_DIRECT_SALE: "Vente directe distributeur",
  DISTRIBUTOR_DISPATCH: "Sortie en dépôt-vente",
  DISTRIBUTOR_SETTLEMENT: "Règlement de distribution",
};

/// Where a source document lives in the application, when a screen exists.
export function sourcePath(sourceType: InventorySourceType): string | null {
  switch (sourceType) {
    case "PURCHASE":
    case "PURCHASE_CANCELLATION":
      return "/achats";
    case "POS_SALE":
      return "/caisse/ventes";
    case "CUSTOMER_ORDER_SALE":
      return "/commandes";
    case "DISTRIBUTOR_DIRECT_SALE":
    case "DISTRIBUTOR_DISPATCH":
    case "DISTRIBUTOR_SETTLEMENT":
      return "/distribution/depot-vente";
    default:
      return null;
  }
}

export function movementTypeLabel(type: string): string {
  return (
    (movementTypeLabels as Record<string, string>)[type] ??
    type.replace(/_/g, " ").toLowerCase()
  );
}
