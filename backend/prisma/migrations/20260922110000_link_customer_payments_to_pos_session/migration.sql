-- Links a customer payment to the POS session that collected it.
-- The source-of-truth expected-cash formula counts "Customer Payments
-- Collected In POS Context", which Sprint 8 could not express because a
-- customer payment had no session. The column stays nullable: a back-office
-- payment records no session and never affects a drawer.

ALTER TABLE "customer_payments"
ADD COLUMN "session_id" TEXT;

CREATE INDEX "customer_payments_session_id_idx" ON "customer_payments"("session_id");

ALTER TABLE "customer_payments"
ADD CONSTRAINT "customer_payments_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "pos_sessions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
