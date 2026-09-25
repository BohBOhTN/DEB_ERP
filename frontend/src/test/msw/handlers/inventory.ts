import { http } from "msw";
import type {
  InventoryBalance,
  InventoryMovement,
} from "../../../features/inventory/inventory.api.js";
import { makeBalance, makeMovement } from "../../factories/inventory.js";
import { makePage } from "../../factories/page.js";
import { apiError, apiV1, ok } from "../envelope.js";

export interface InventoryStore {
  balances: InventoryBalance[];
  movements: InventoryMovement[];
}

export function makeInventoryStore(
  overrides: Partial<InventoryStore> = {},
): InventoryStore {
  return {
    balances: [
      makeBalance({
        itemId: "product-1",
        itemName: "Pain complet",
        quantity: "18",
      }),
      makeBalance({
        itemType: "RAW_MATERIAL",
        itemId: "raw-1",
        itemName: "Farine T55",
        unitName: "Kilogramme",
        unitSymbol: "kg",
        quantity: "-2.5",
        isNegative: true,
      }),
    ],
    movements: [
      makeMovement({
        id: "movement-1",
        productId: "product-1",
        quantityDelta: "20",
      }),
      makeMovement({
        id: "movement-2",
        productId: "product-1",
        movementType: "STOCK_ADJUSTMENT_DECREASE",
        sourceType: "STOCK_ADJUSTMENT",
        quantityDelta: "-2",
        reason: "Casse",
        occurredAt: "2026-09-22T11:00:00.000Z",
      }),
    ],
    ...overrides,
  };
}

let sequence = 100;

function applyMovement(store: InventoryStore, movement: InventoryMovement) {
  store.movements.unshift(movement);
  const itemId = movement.productId ?? movement.rawMaterialId ?? "";
  const balance = store.balances.find((row) => row.itemId === itemId);
  if (balance) {
    const quantity = (
      Number(balance.quantity) + Number(movement.quantityDelta)
    ).toString();
    Object.assign(balance, {
      quantity,
      isNegative: Number(quantity) < 0,
      lastMovementAt: movement.occurredAt,
    });
  } else {
    store.balances.push(
      makeBalance({
        itemType: movement.itemType,
        itemId,
        itemName: movement.itemNameSnapshot,
        unitName: movement.unitNameSnapshot,
        unitSymbol: movement.unitNameSnapshot.toLowerCase().startsWith("kilo")
          ? "kg"
          : "pièce",
        quantity: movement.quantityDelta,
        isNegative: Number(movement.quantityDelta) < 0,
        lastMovementAt: movement.occurredAt,
      }),
    );
  }
}

export function inventoryHandlers(
  store: InventoryStore = makeInventoryStore(),
) {
  return [
    http.get(`${apiV1}/inventory/balances`, () =>
      ok({ balances: store.balances }),
    ),
    http.get(`${apiV1}/inventory/movements`, ({ request }) => {
      const url = new URL(request.url);
      const itemId = url.searchParams.get("itemId");
      const movementType = url.searchParams.get("movementType");
      const pageNumber = Number(url.searchParams.get("page") ?? "1");
      const pageSize = Number(url.searchParams.get("pageSize") ?? "25");
      const matching = store.movements.filter(
        (row) =>
          (!itemId ||
            row.productId === itemId ||
            row.rawMaterialId === itemId) &&
          (!movementType || row.movementType === movementType),
      );
      const start = (pageNumber - 1) * pageSize;
      return ok(
        makePage(matching.slice(start, start + pageSize), {
          page: pageNumber,
          pageSize,
          total: matching.length,
        }),
      );
    }),
    http.post(`${apiV1}/inventory/opening-stock`, async ({ request }) => {
      if (!request.headers.get("Idempotency-Key"))
        return apiError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Une clé d'idempotence est requise.",
        );
      const body = (await request.json()) as {
        itemType: "PRODUCT" | "RAW_MATERIAL";
        itemId: string;
        quantity: string;
        reason: string;
      };
      sequence += 1;
      const movement = makeMovement({
        id: `movement-${sequence}`,
        itemType: body.itemType,
        productId: body.itemType === "PRODUCT" ? body.itemId : null,
        rawMaterialId: body.itemType === "RAW_MATERIAL" ? body.itemId : null,
        movementType: "OPENING_STOCK",
        sourceType: "OPENING_STOCK",
        quantityDelta: body.quantity,
        reason: body.reason,
        itemNameSnapshot:
          store.balances.find((row) => row.itemId === body.itemId)?.itemName ??
          "Pain complet",
        unitNameSnapshot:
          store.balances.find((row) => row.itemId === body.itemId)?.unitName ??
          "Pièce",
        occurredAt: new Date().toISOString(),
      });
      applyMovement(store, movement);
      return ok({ movement }, 201);
    }),
    http.post(`${apiV1}/inventory/adjustments`, async ({ request }) => {
      if (!request.headers.get("Idempotency-Key"))
        return apiError(
          400,
          "IDEMPOTENCY_KEY_REQUIRED",
          "Une clé d'idempotence est requise.",
        );
      const body = (await request.json()) as {
        itemType: "PRODUCT" | "RAW_MATERIAL";
        itemId: string;
        quantityDelta: string;
        reason: string;
      };
      sequence += 1;
      const decrease = body.quantityDelta.startsWith("-");
      const movement = makeMovement({
        id: `movement-${sequence}`,
        itemType: body.itemType,
        productId: body.itemType === "PRODUCT" ? body.itemId : null,
        rawMaterialId: body.itemType === "RAW_MATERIAL" ? body.itemId : null,
        movementType: decrease
          ? "STOCK_ADJUSTMENT_DECREASE"
          : "STOCK_ADJUSTMENT_INCREASE",
        sourceType: "STOCK_ADJUSTMENT",
        quantityDelta: body.quantityDelta,
        reason: body.reason,
        itemNameSnapshot:
          store.balances.find((row) => row.itemId === body.itemId)?.itemName ??
          "Pain complet",
        unitNameSnapshot:
          store.balances.find((row) => row.itemId === body.itemId)?.unitName ??
          "Pièce",
        occurredAt: new Date().toISOString(),
      });
      applyMovement(store, movement);
      return ok({ movement }, 201);
    }),
  ];
}
