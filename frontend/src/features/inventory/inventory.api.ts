import { apiClient } from "../../lib/api/client.js";
import type { PageResult, SortSpec } from "../../lib/api/pagination.js";
import { toSearchParams } from "../../lib/api/pagination.js";

/// `/api/v1/inventory` (UI-11). Movement rows carry item and unit name
/// snapshots, the actor and the source document reference when one exists.
export type InventoryItemType = "PRODUCT" | "RAW_MATERIAL";

export type InventoryMovementType =
  | "OPENING_STOCK"
  | "PURCHASE_RECEIPT"
  | "POS_SALE"
  | "ORDER_SALE"
  | "DISTRIBUTOR_DIRECT_SALE"
  | "DISTRIBUTOR_DISPATCH_OUT"
  | "DISTRIBUTOR_RETURN_IN"
  | "DISTRIBUTOR_SETTLED_SALE"
  | "STOCK_ADJUSTMENT_INCREASE"
  | "STOCK_ADJUSTMENT_DECREASE"
  | "REVERSAL";

export type InventorySourceType =
  | "OPENING_STOCK"
  | "STOCK_ADJUSTMENT"
  | "PURCHASE"
  | "PURCHASE_CANCELLATION"
  | "POS_SALE"
  | "CUSTOMER_ORDER_SALE"
  | "DISTRIBUTOR_DIRECT_SALE"
  | "DISTRIBUTOR_DISPATCH"
  | "DISTRIBUTOR_SETTLEMENT";

export interface InventoryBalance {
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  unitName: string;
  unitSymbol: string;
  quantity: string;
  isNegative: boolean;
  lastMovementAt: string | null;
}

export interface InventoryMovement {
  id: string;
  itemType: InventoryItemType;
  productId: string | null;
  rawMaterialId: string | null;
  movementType: InventoryMovementType;
  quantityDelta: string;
  itemNameSnapshot: string;
  unitNameSnapshot: string;
  sourceType: InventorySourceType;
  sourceId: string | null;
  sourceReference: string | null;
  reason: string | null;
  occurredAt: string;
  createdBy: { id: string; displayName: string } | null;
}

export interface MovementListQuery {
  page: number;
  pageSize: number;
  sort?: SortSpec;
  itemType?: InventoryItemType;
  itemId?: string;
  movementType?: InventoryMovementType;
  sourceType?: InventorySourceType;
  from?: string;
  to?: string;
}

export async function listBalances(): Promise<InventoryBalance[]> {
  return (
    await apiClient.get<{ balances: InventoryBalance[] }>("/inventory/balances")
  ).balances;
}

export function listMovements(
  query: MovementListQuery,
): Promise<PageResult<InventoryMovement>> {
  return apiClient.list<InventoryMovement>("/inventory/movements", {
    query: toSearchParams({ ...query }),
  });
}

export interface OpeningStockInput {
  itemType: InventoryItemType;
  itemId: string;
  quantity: string;
  reason: string;
}

export interface AdjustmentInput {
  itemType: InventoryItemType;
  itemId: string;
  quantityDelta: string;
  reason: string;
}

export async function postOpeningStock(
  input: OpeningStockInput,
  idempotencyKey: string,
): Promise<InventoryMovement> {
  return (
    await apiClient.post<{ movement: InventoryMovement }>(
      "/inventory/opening-stock",
      input,
      { idempotencyKey },
    )
  ).movement;
}

export async function postAdjustment(
  input: AdjustmentInput,
  idempotencyKey: string,
): Promise<InventoryMovement> {
  return (
    await apiClient.post<{ movement: InventoryMovement }>(
      "/inventory/adjustments",
      input,
      { idempotencyKey },
    )
  ).movement;
}
