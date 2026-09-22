-- R3 Sprint 8 customer credit and payments foundation.
-- Adds customers, customer receivable ledger, customer payments, and extends
-- POS sales from paid-only to paid, partial, and unpaid customer sales.

CREATE TYPE "CustomerPaymentMethod" AS ENUM ('CASH');
CREATE TYPE "CustomerLedgerEntryType" AS ENUM (
    'SALE_RECEIVABLE',
    'PAYMENT',
    'SALE_REVERSAL',
    'PAYMENT_REVERSAL'
);

CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "tax_identifier" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sales"
ADD COLUMN "customer_id" TEXT,
ADD COLUMN "remaining_due_tnd" DECIMAL(14,3) NOT NULL DEFAULT 0;

CREATE TABLE "customer_payments" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "amount_tnd" DECIMAL(14,3) NOT NULL,
    "method" "CustomerPaymentMethod" NOT NULL DEFAULT 'CASH',
    "paid_at" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "actor_user_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_payment_allocations" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "amount_tnd" DECIMAL(14,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_ledger_entries" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "sale_id" TEXT,
    "payment_id" TEXT,
    "entry_type" "CustomerLedgerEntryType" NOT NULL,
    "amount_tnd" DECIMAL(14,3) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customers_is_active_idx" ON "customers"("is_active");
CREATE INDEX "customers_normalized_name_idx" ON "customers"("normalized_name");
CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");
CREATE INDEX "customer_payments_customer_id_idx" ON "customer_payments"("customer_id");
CREATE INDEX "customer_payments_paid_at_idx" ON "customer_payments"("paid_at");
CREATE UNIQUE INDEX "customer_payment_allocations_payment_id_sale_id_key"
ON "customer_payment_allocations"("payment_id", "sale_id");
CREATE INDEX "customer_payment_allocations_sale_id_idx" ON "customer_payment_allocations"("sale_id");
CREATE INDEX "customer_ledger_entries_customer_id_idx" ON "customer_ledger_entries"("customer_id");
CREATE INDEX "customer_ledger_entries_sale_id_idx" ON "customer_ledger_entries"("sale_id");
CREATE INDEX "customer_ledger_entries_payment_id_idx" ON "customer_ledger_entries"("payment_id");
CREATE INDEX "customer_ledger_entries_occurred_at_idx" ON "customer_ledger_entries"("occurred_at");

ALTER TABLE "sales"
ADD CONSTRAINT "sales_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_payments"
ADD CONSTRAINT "customer_payments_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_payment_allocations"
ADD CONSTRAINT "customer_payment_allocations_payment_id_fkey"
FOREIGN KEY ("payment_id") REFERENCES "customer_payments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_payment_allocations"
ADD CONSTRAINT "customer_payment_allocations_sale_id_fkey"
FOREIGN KEY ("sale_id") REFERENCES "sales"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_ledger_entries"
ADD CONSTRAINT "customer_ledger_entries_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_ledger_entries"
ADD CONSTRAINT "customer_ledger_entries_sale_id_fkey"
FOREIGN KEY ("sale_id") REFERENCES "sales"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_ledger_entries"
ADD CONSTRAINT "customer_ledger_entries_payment_id_fkey"
FOREIGN KEY ("payment_id") REFERENCES "customer_payments"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales"
DROP CONSTRAINT "sales_paid_direct_sale_check";

ALTER TABLE "sales"
ADD CONSTRAINT "sales_payment_state_consistency_check"
CHECK (
    "status" = 'CANCELLED'
    OR (
        "total_tnd" > 0
        AND "paid_amount_tnd" >= 0
        AND "paid_amount_tnd" <= "total_tnd"
        AND "remaining_due_tnd" = "total_tnd" - "paid_amount_tnd"
        AND (
            ("payment_state" = 'PAID' AND "remaining_due_tnd" = 0)
            OR ("payment_state" = 'PARTIALLY_PAID' AND "paid_amount_tnd" > 0 AND "remaining_due_tnd" > 0 AND "customer_id" IS NOT NULL)
            OR ("payment_state" = 'UNPAID' AND "paid_amount_tnd" = 0 AND "remaining_due_tnd" > 0 AND "customer_id" IS NOT NULL)
        )
    )
);

ALTER TABLE "customer_payments"
ADD CONSTRAINT "customer_payments_positive_amount_check"
CHECK ("amount_tnd" > 0);

ALTER TABLE "customer_payment_allocations"
ADD CONSTRAINT "customer_payment_allocations_positive_amount_check"
CHECK ("amount_tnd" > 0);
