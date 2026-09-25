-- Sprint 16 (BE-18): indexes for the predicates the services actually use,
-- plus trigram indexes so "contains" searches stop scanning whole tables.
-- Everything here is additive.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- POS sales list filters and the session close aggregation.
CREATE INDEX "sales_payment_state_idx" ON "sales"("payment_state");
CREATE INDEX "sales_posted_by_user_id_idx" ON "sales"("posted_by_user_id");
CREATE INDEX "sales_session_id_posted_at_idx" ON "sales"("session_id", "posted_at");

-- Audit viewer filters.
CREATE INDEX "audit_events_action_idx" ON "audit_events"("action");
CREATE INDEX "audit_events_correlation_id_idx" ON "audit_events"("correlation_id");
CREATE INDEX "audit_events_target_id_idx" ON "audit_events"("target_id");

-- Purchase list filters and the due/overdue views.
CREATE INDEX "purchases_payment_terms_idx" ON "purchases"("payment_terms");
CREATE INDEX "purchases_status_due_date_idx" ON "purchases"("status", "due_date");

-- Order queue by status and fulfilment time.
CREATE INDEX "customer_orders_status_requested_fulfillment_at_idx" ON "customer_orders"("status", "requested_fulfillment_at");

-- Customer balance aggregation by kind.
CREATE INDEX "customer_ledger_entries_customer_id_balance_kind_idx" ON "customer_ledger_entries"("customer_id", "balance_kind");

-- Expense totals over a period.
CREATE INDEX "expenses_status_expense_date_idx" ON "expenses"("status", "expense_date");

-- POS product list is sorted by name.
CREATE INDEX "products_name_idx" ON "products"("name");

-- Trigram indexes serve ILIKE '%term%' searches, which a btree cannot.
CREATE INDEX "products_normalized_name_trgm_idx" ON "products" USING GIN ("normalized_name" gin_trgm_ops);
CREATE INDEX "products_code_trgm_idx" ON "products" USING GIN ("code" gin_trgm_ops);
CREATE INDEX "products_barcode_trgm_idx" ON "products" USING GIN ("barcode" gin_trgm_ops);
CREATE INDEX "raw_materials_normalized_name_trgm_idx" ON "raw_materials" USING GIN ("normalized_name" gin_trgm_ops);
CREATE INDEX "customers_normalized_name_trgm_idx" ON "customers" USING GIN ("normalized_name" gin_trgm_ops);
CREATE INDEX "customers_phone_trgm_idx" ON "customers" USING GIN ("phone" gin_trgm_ops);
CREATE INDEX "suppliers_normalized_name_trgm_idx" ON "suppliers" USING GIN ("normalized_name" gin_trgm_ops);
CREATE INDEX "distributors_normalized_name_trgm_idx" ON "distributors" USING GIN ("normalized_name" gin_trgm_ops);
