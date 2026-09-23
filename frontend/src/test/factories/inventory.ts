import type {
  InventoryBalance,
  InventoryMovement,
} from "../../features/inventory/inventory.api.js";

let sequence = 0;

export function makeBalance(
  overrides: Partial<InventoryBalance> = {},
): InventoryBalance {
  sequence += 1;
  return {
    itemType: "PRODUCT",
    itemId: `product-${sequence}`,
    itemName: `Pain complet ${sequence}`,
    unitName: "Pièce",
    unitSymbol: "pièce",
    quantity: "18",
    isNegative: false,
    lastMovementAt: "2026-09-22T10:00:00.000Z",
    ...overrides,
  };
}

export function makeMovement(
  overrides: Partial<InventoryMovement> = {},
): InventoryMovement {
  sequence += 1;
  return {
    id: `movement-${sequence}`,
    itemType: "PRODUCT",
    productId: "product-1",
    rawMaterialId: null,
    movementType: "OPENING_STOCK",
    quantityDelta: "20",
    itemNameSnapshot: "Pain complet",
    unitNameSnapshot: "Pièce",
    sourceType: "OPENING_STOCK",
    sourceId: null,
    sourceReference: null,
    reason: "Inventaire initial",
    occurredAt: "2026-09-22T09:00:00.000Z",
    createdBy: { id: "user-1", displayName: "Salma Ben Ali" },
    ...overrides,
  };
}
