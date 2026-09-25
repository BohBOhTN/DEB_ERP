-- Issue #46: a customer's sales by state and date, and their statement paged
-- by date. Additive.
CREATE INDEX "sales_customer_id_status_sold_at_idx" ON "sales"("customer_id", "status", "sold_at");
CREATE INDEX "customer_ledger_entries_customer_id_occurred_at_idx" ON "customer_ledger_entries"("customer_id", "occurred_at");
