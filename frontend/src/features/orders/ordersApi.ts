/// Compatibility shim for the V1 POS screen (deleted in Sprint 23): saving
/// the cart as an order delegates to the V2 API client.
import { createIdempotencyKey } from "../../lib/api/idempotency.js";
import { createOrder as createOrderV2, type Order } from "./orders.api.js";

export type CustomerOrder = Order;

export async function createOrder(params: {
  customerId: string;
  requestedFulfillmentAt: string;
  notes?: string;
  lines: Array<{ productId: string; quantity: string }>;
}): Promise<Order> {
  return createOrderV2(params, createIdempotencyKey());
}
