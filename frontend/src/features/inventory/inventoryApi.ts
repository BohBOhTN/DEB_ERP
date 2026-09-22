import { readApiError, type ApiEnvelope } from "../auth/authApi";

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export type InventoryItemType = "PRODUCT" | "RAW_MATERIAL";

export interface InventoryBalance {
  itemType: InventoryItemType;
  itemId: string;
  itemName: string;
  unitName: string;
  quantity: string;
  isNegative: boolean;
}

export interface InventoryMovement {
  id: string;
  itemType: InventoryItemType;
  movementType: string;
  quantityDelta: string;
  itemNameSnapshot: string;
  unitNameSnapshot: string;
  reason: string | null;
  occurredAt: string;
}

export interface Page<TItem> {
  items: TItem[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export async function getInventoryWorkspace(): Promise<{
  balances: InventoryBalance[];
  movements: Page<InventoryMovement>;
}> {
  const [balances, movements] = await Promise.all([
    getBalances(),
    getMovements(),
  ]);

  return { balances, movements };
}

export async function getBalances(): Promise<InventoryBalance[]> {
  const response = await fetch(`${apiBaseUrl}/inventory/balances`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<{
    balances: InventoryBalance[];
  }>;
  return body.data.balances;
}

export async function getMovements(): Promise<Page<InventoryMovement>> {
  const response = await fetch(`${apiBaseUrl}/inventory/movements`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw await readApiError(response);
  }

  const body = (await response.json()) as ApiEnvelope<{
    movements: Page<InventoryMovement>;
  }>;
  return body.data.movements;
}

export async function postOpeningStock(params: {
  itemType: InventoryItemType;
  itemId: string;
  quantity: string;
  reason: string;
}): Promise<void> {
  await postCommand("/inventory/opening-stock", params);
}

export async function postAdjustment(params: {
  itemType: InventoryItemType;
  itemId: string;
  quantityDelta: string;
  reason: string;
}): Promise<void> {
  await postCommand("/inventory/adjustments", params);
}

async function postCommand(path: string, payload: unknown): Promise<void> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await readApiError(response);
  }
}
