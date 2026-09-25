-- Issue #47: a payment settles documents, and every receivable document keeps
-- its paid state in step with the ledger. Everything here is additive; the
-- final UPDATEs rebuild the stored projections from the ledger entries.

-- Purchases store their remaining due like sales and distributor documents.
ALTER TABLE "purchases" ADD COLUMN "remaining_due_tnd" DECIMAL(14,3) NOT NULL DEFAULT 0;

-- `paid_amount_tnd` becomes a live projection of the supplier ledger, so the
-- posting-time terms can no longer pin it: an UNPAID purchase settled later
-- keeps its terms and carries what was paid since. The terms still fix the
-- due date, the service still validates the amount paid at posting, and
-- `purchases_amounts_check` still bounds the paid amount by the total.
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_payment_terms_check";
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_payment_terms_check" CHECK (
    ("payment_terms" = 'PAID' AND "due_date" IS NULL)
    OR
    ("payment_terms" IN ('PARTIAL', 'UNPAID') AND "total_tnd" > 0 AND "due_date" IS NOT NULL)
);
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_remaining_due_check" CHECK (
    "remaining_due_tnd" >= 0 AND "remaining_due_tnd" <= "total_tnd"
);

-- Reversal trail on the three payment tables. A till règlement reversed later
-- leaves the drawer of the session it is reversed in.
ALTER TABLE "customer_payments"
  ADD COLUMN "reversed_at" TIMESTAMP(3),
  ADD COLUMN "reversed_by_user_id" TEXT,
  ADD COLUMN "reversal_reason" TEXT,
  ADD COLUMN "reversed_in_session_id" TEXT;
ALTER TABLE "customer_payments"
  ADD CONSTRAINT "customer_payments_reversed_in_session_id_fkey"
  FOREIGN KEY ("reversed_in_session_id") REFERENCES "pos_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "customer_payments_reversed_in_session_id_idx" ON "customer_payments"("reversed_in_session_id");
CREATE INDEX "customer_payments_customer_id_paid_at_idx" ON "customer_payments"("customer_id", "paid_at");

ALTER TABLE "supplier_payments"
  ADD COLUMN "reversed_at" TIMESTAMP(3),
  ADD COLUMN "reversed_by_user_id" TEXT,
  ADD COLUMN "reversal_reason" TEXT;
CREATE INDEX "supplier_payments_supplier_id_paid_at_idx" ON "supplier_payments"("supplier_id", "paid_at");

ALTER TABLE "distributor_payments"
  ADD COLUMN "reversed_at" TIMESTAMP(3),
  ADD COLUMN "reversed_by_user_id" TEXT,
  ADD COLUMN "reversal_reason" TEXT;
CREATE INDEX "distributor_payments_distributor_id_paid_at_idx" ON "distributor_payments"("distributor_id", "paid_at");

-- Rebuild the projections from the ledger (GOV-006). A document with no ledger
-- entry keeps its posting-time values, which are then still exact.
UPDATE "sales" s
SET "remaining_due_tnd" = GREATEST(0, LEAST(s."total_tnd", b."balance")),
    "paid_amount_tnd"   = s."total_tnd" - GREATEST(0, LEAST(s."total_tnd", b."balance")),
    "payment_state"     = CASE
      WHEN GREATEST(0, LEAST(s."total_tnd", b."balance")) <= 0 THEN 'PAID'::"SalePaymentState"
      WHEN GREATEST(0, LEAST(s."total_tnd", b."balance")) >= s."total_tnd" THEN 'UNPAID'::"SalePaymentState"
      ELSE 'PARTIALLY_PAID'::"SalePaymentState" END
FROM (
  SELECT "sale_id", SUM("amount_tnd") AS "balance"
  FROM "customer_ledger_entries"
  WHERE "sale_id" IS NOT NULL AND "balance_kind" = 'RECEIVABLE'
  GROUP BY "sale_id"
) b
WHERE s."id" = b."sale_id" AND s."status" = 'POSTED';

UPDATE "distributor_sales" s
SET "remaining_due_tnd" = GREATEST(0, LEAST(s."total_tnd", b."balance")),
    "paid_amount_tnd"   = s."total_tnd" - GREATEST(0, LEAST(s."total_tnd", b."balance")),
    "payment_state"     = CASE
      WHEN GREATEST(0, LEAST(s."total_tnd", b."balance")) <= 0 THEN 'PAID'::"SalePaymentState"
      WHEN GREATEST(0, LEAST(s."total_tnd", b."balance")) >= s."total_tnd" THEN 'UNPAID'::"SalePaymentState"
      ELSE 'PARTIALLY_PAID'::"SalePaymentState" END
FROM (
  SELECT "sale_id", SUM("amount_tnd") AS "balance"
  FROM "distributor_ledger_entries"
  WHERE "sale_id" IS NOT NULL
  GROUP BY "sale_id"
) b
WHERE s."id" = b."sale_id" AND s."status" = 'POSTED';

UPDATE "distributor_settlements" s
SET "remaining_due_tnd" = GREATEST(0, LEAST(s."total_tnd", b."balance")),
    "paid_amount_tnd"   = s."total_tnd" - GREATEST(0, LEAST(s."total_tnd", b."balance")),
    "payment_state"     = CASE
      WHEN GREATEST(0, LEAST(s."total_tnd", b."balance")) <= 0 THEN 'PAID'::"SalePaymentState"
      WHEN GREATEST(0, LEAST(s."total_tnd", b."balance")) >= s."total_tnd" THEN 'UNPAID'::"SalePaymentState"
      ELSE 'PARTIALLY_PAID'::"SalePaymentState" END
FROM (
  SELECT "settlement_id", SUM("amount_tnd") AS "balance"
  FROM "distributor_ledger_entries"
  WHERE "settlement_id" IS NOT NULL
  GROUP BY "settlement_id"
) b
WHERE s."id" = b."settlement_id";

-- Posted purchases first take their posting-time remainder, then the ledger
-- overrides it wherever an entry exists.
UPDATE "purchases"
SET "remaining_due_tnd" = "total_tnd" - "paid_amount_tnd"
WHERE "status" = 'POSTED';

UPDATE "purchases" p
SET "remaining_due_tnd" = GREATEST(0, LEAST(p."total_tnd", b."balance")),
    "paid_amount_tnd"   = p."total_tnd" - GREATEST(0, LEAST(p."total_tnd", b."balance"))
FROM (
  SELECT "purchase_id", SUM("amount_tnd") AS "balance"
  FROM "supplier_ledger_entries"
  WHERE "purchase_id" IS NOT NULL
  GROUP BY "purchase_id"
) b
WHERE p."id" = b."purchase_id" AND p."status" = 'POSTED';
