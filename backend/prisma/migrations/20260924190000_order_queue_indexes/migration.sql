-- Issue #45: the queue filtered by customer and sorted by due time, and an
-- order's advances read by date. Additive.
CREATE INDEX "customer_orders_customer_id_requested_fulfillment_at_idx" ON "customer_orders"("customer_id", "requested_fulfillment_at");
CREATE INDEX "customer_order_advances_order_id_paid_at_idx" ON "customer_order_advances"("order_id", "paid_at");
