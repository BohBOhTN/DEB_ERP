-- R4 Sprint 10 distributor streams.
-- Adds distributors, direct distributor sales, consignment dispatch with
-- custody, settlement, and distributor receivable ledger and payments.
-- Custody lives on the dispatch lines: still-held quantity is derived, never
-- stored, so no quantity can disappear or be classified twice.

CREATE TYPE "DistributorDispatchStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "DistributorPaymentMethod" AS ENUM ('CASH');
CREATE TYPE "DistributorLedgerEntryType" AS ENUM (
    'SALE_RECEIVABLE',
    'SETTLEMENT_RECEIVABLE',
    'PAYMENT',
    'SALE_REVERSAL',
    'PAYMENT_REVERSAL'
);

CREATE SEQUENCE "distributor_sale_reference_seq" START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE "distributor_dispatch_reference_seq" START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE "distributor_settlement_reference_seq" START WITH 1 INCREMENT BY 1;

CREATE TABLE "distributors" (
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

    CONSTRAINT "distributors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "distributor_sales" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "distributor_id" TEXT NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'POSTED',
    "payment_state" "SalePaymentState" NOT NULL,
    "sold_at" TIMESTAMP(3) NOT NULL,
    "total_tnd" DECIMAL(14,3) NOT NULL,
    "paid_amount_tnd" DECIMAL(14,3) NOT NULL,
    "remaining_due_tnd" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "posted_at" TIMESTAMP(3) NOT NULL,
    "posted_by_user_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributor_sales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "distributor_sale_lines" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit_price_tnd" DECIMAL(14,3) NOT NULL,
    "line_total_tnd" DECIMAL(14,3) NOT NULL,
    "product_name_snapshot" TEXT NOT NULL,
    "unit_name_snapshot" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distributor_sale_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "distributor_dispatches" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "distributor_id" TEXT NOT NULL,
    "status" "DistributorDispatchStatus" NOT NULL DEFAULT 'OPEN',
    "dispatched_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "posted_by_user_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributor_dispatches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "distributor_dispatch_lines" (
    "id" TEXT NOT NULL,
    "dispatch_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "dispatched_quantity" DECIMAL(18,6) NOT NULL,
    "settled_sold_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "returned_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unaccounted_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "product_name_snapshot" TEXT NOT NULL,
    "unit_name_snapshot" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributor_dispatch_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "distributor_settlements" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "distributor_id" TEXT NOT NULL,
    "dispatch_id" TEXT NOT NULL,
    "settled_at" TIMESTAMP(3) NOT NULL,
    "total_tnd" DECIMAL(14,3) NOT NULL,
    "paid_amount_tnd" DECIMAL(14,3) NOT NULL,
    "remaining_due_tnd" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "payment_state" "SalePaymentState" NOT NULL,
    "notes" TEXT,
    "posted_at" TIMESTAMP(3) NOT NULL,
    "posted_by_user_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distributor_settlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "distributor_settlement_lines" (
    "id" TEXT NOT NULL,
    "settlement_id" TEXT NOT NULL,
    "dispatch_line_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "sold_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "returned_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unaccounted_quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unit_price_tnd" DECIMAL(14,3) NOT NULL,
    "line_total_tnd" DECIMAL(14,3) NOT NULL,
    "product_name_snapshot" TEXT NOT NULL,
    "unit_name_snapshot" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distributor_settlement_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "distributor_payments" (
    "id" TEXT NOT NULL,
    "distributor_id" TEXT NOT NULL,
    "amount_tnd" DECIMAL(14,3) NOT NULL,
    "method" "DistributorPaymentMethod" NOT NULL DEFAULT 'CASH',
    "paid_at" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "actor_user_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distributor_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "distributor_payment_allocations" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "sale_id" TEXT,
    "settlement_id" TEXT,
    "amount_tnd" DECIMAL(14,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distributor_payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "distributor_ledger_entries" (
    "id" TEXT NOT NULL,
    "distributor_id" TEXT NOT NULL,
    "sale_id" TEXT,
    "settlement_id" TEXT,
    "payment_id" TEXT,
    "entry_type" "DistributorLedgerEntryType" NOT NULL,
    "amount_tnd" DECIMAL(14,3) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distributor_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "distributors_is_active_idx" ON "distributors"("is_active");
CREATE INDEX "distributors_normalized_name_idx" ON "distributors"("normalized_name");

CREATE UNIQUE INDEX "distributor_sales_reference_key" ON "distributor_sales"("reference");
CREATE INDEX "distributor_sales_distributor_id_idx" ON "distributor_sales"("distributor_id");
CREATE INDEX "distributor_sales_sold_at_idx" ON "distributor_sales"("sold_at");
CREATE INDEX "distributor_sales_status_idx" ON "distributor_sales"("status");

CREATE UNIQUE INDEX "distributor_sale_lines_sale_id_product_id_key"
ON "distributor_sale_lines"("sale_id", "product_id");
CREATE INDEX "distributor_sale_lines_sale_id_idx" ON "distributor_sale_lines"("sale_id");
CREATE INDEX "distributor_sale_lines_product_id_idx" ON "distributor_sale_lines"("product_id");
CREATE INDEX "distributor_sale_lines_unit_id_idx" ON "distributor_sale_lines"("unit_id");

CREATE UNIQUE INDEX "distributor_dispatches_reference_key" ON "distributor_dispatches"("reference");
CREATE INDEX "distributor_dispatches_distributor_id_idx" ON "distributor_dispatches"("distributor_id");
CREATE INDEX "distributor_dispatches_status_idx" ON "distributor_dispatches"("status");
CREATE INDEX "distributor_dispatches_dispatched_at_idx" ON "distributor_dispatches"("dispatched_at");

CREATE UNIQUE INDEX "distributor_dispatch_lines_dispatch_id_product_id_key"
ON "distributor_dispatch_lines"("dispatch_id", "product_id");
CREATE INDEX "distributor_dispatch_lines_dispatch_id_idx" ON "distributor_dispatch_lines"("dispatch_id");
CREATE INDEX "distributor_dispatch_lines_product_id_idx" ON "distributor_dispatch_lines"("product_id");
CREATE INDEX "distributor_dispatch_lines_unit_id_idx" ON "distributor_dispatch_lines"("unit_id");

CREATE UNIQUE INDEX "distributor_settlements_reference_key" ON "distributor_settlements"("reference");
CREATE INDEX "distributor_settlements_distributor_id_idx" ON "distributor_settlements"("distributor_id");
CREATE INDEX "distributor_settlements_dispatch_id_idx" ON "distributor_settlements"("dispatch_id");
CREATE INDEX "distributor_settlements_settled_at_idx" ON "distributor_settlements"("settled_at");

CREATE UNIQUE INDEX "distributor_settlement_lines_settlement_id_dispatch_line_id_key"
ON "distributor_settlement_lines"("settlement_id", "dispatch_line_id");
CREATE INDEX "distributor_settlement_lines_settlement_id_idx" ON "distributor_settlement_lines"("settlement_id");
CREATE INDEX "distributor_settlement_lines_dispatch_line_id_idx" ON "distributor_settlement_lines"("dispatch_line_id");
CREATE INDEX "distributor_settlement_lines_product_id_idx" ON "distributor_settlement_lines"("product_id");
CREATE INDEX "distributor_settlement_lines_unit_id_idx" ON "distributor_settlement_lines"("unit_id");

CREATE INDEX "distributor_payments_distributor_id_idx" ON "distributor_payments"("distributor_id");
CREATE INDEX "distributor_payments_paid_at_idx" ON "distributor_payments"("paid_at");

CREATE UNIQUE INDEX "distributor_payment_allocations_payment_id_sale_id_key"
ON "distributor_payment_allocations"("payment_id", "sale_id");
CREATE UNIQUE INDEX "distributor_payment_allocations_payment_id_settlement_id_key"
ON "distributor_payment_allocations"("payment_id", "settlement_id");
CREATE INDEX "distributor_payment_allocations_sale_id_idx" ON "distributor_payment_allocations"("sale_id");
CREATE INDEX "distributor_payment_allocations_settlement_id_idx"
ON "distributor_payment_allocations"("settlement_id");

CREATE INDEX "distributor_ledger_entries_distributor_id_idx" ON "distributor_ledger_entries"("distributor_id");
CREATE INDEX "distributor_ledger_entries_sale_id_idx" ON "distributor_ledger_entries"("sale_id");
CREATE INDEX "distributor_ledger_entries_settlement_id_idx" ON "distributor_ledger_entries"("settlement_id");
CREATE INDEX "distributor_ledger_entries_payment_id_idx" ON "distributor_ledger_entries"("payment_id");
CREATE INDEX "distributor_ledger_entries_occurred_at_idx" ON "distributor_ledger_entries"("occurred_at");

ALTER TABLE "distributor_sales"
ADD CONSTRAINT "distributor_sales_distributor_id_fkey"
FOREIGN KEY ("distributor_id") REFERENCES "distributors"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distributor_sale_lines"
ADD CONSTRAINT "distributor_sale_lines_sale_id_fkey"
FOREIGN KEY ("sale_id") REFERENCES "distributor_sales"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "distributor_sale_lines"
ADD CONSTRAINT "distributor_sale_lines_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distributor_sale_lines"
ADD CONSTRAINT "distributor_sale_lines_unit_id_fkey"
FOREIGN KEY ("unit_id") REFERENCES "units"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distributor_dispatches"
ADD CONSTRAINT "distributor_dispatches_distributor_id_fkey"
FOREIGN KEY ("distributor_id") REFERENCES "distributors"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distributor_dispatch_lines"
ADD CONSTRAINT "distributor_dispatch_lines_dispatch_id_fkey"
FOREIGN KEY ("dispatch_id") REFERENCES "distributor_dispatches"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "distributor_dispatch_lines"
ADD CONSTRAINT "distributor_dispatch_lines_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distributor_dispatch_lines"
ADD CONSTRAINT "distributor_dispatch_lines_unit_id_fkey"
FOREIGN KEY ("unit_id") REFERENCES "units"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distributor_settlements"
ADD CONSTRAINT "distributor_settlements_distributor_id_fkey"
FOREIGN KEY ("distributor_id") REFERENCES "distributors"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distributor_settlements"
ADD CONSTRAINT "distributor_settlements_dispatch_id_fkey"
FOREIGN KEY ("dispatch_id") REFERENCES "distributor_dispatches"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distributor_settlement_lines"
ADD CONSTRAINT "distributor_settlement_lines_settlement_id_fkey"
FOREIGN KEY ("settlement_id") REFERENCES "distributor_settlements"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "distributor_settlement_lines"
ADD CONSTRAINT "distributor_settlement_lines_dispatch_line_id_fkey"
FOREIGN KEY ("dispatch_line_id") REFERENCES "distributor_dispatch_lines"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distributor_settlement_lines"
ADD CONSTRAINT "distributor_settlement_lines_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distributor_settlement_lines"
ADD CONSTRAINT "distributor_settlement_lines_unit_id_fkey"
FOREIGN KEY ("unit_id") REFERENCES "units"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distributor_payments"
ADD CONSTRAINT "distributor_payments_distributor_id_fkey"
FOREIGN KEY ("distributor_id") REFERENCES "distributors"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distributor_payment_allocations"
ADD CONSTRAINT "distributor_payment_allocations_payment_id_fkey"
FOREIGN KEY ("payment_id") REFERENCES "distributor_payments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "distributor_payment_allocations"
ADD CONSTRAINT "distributor_payment_allocations_sale_id_fkey"
FOREIGN KEY ("sale_id") REFERENCES "distributor_sales"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distributor_payment_allocations"
ADD CONSTRAINT "distributor_payment_allocations_settlement_id_fkey"
FOREIGN KEY ("settlement_id") REFERENCES "distributor_settlements"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distributor_ledger_entries"
ADD CONSTRAINT "distributor_ledger_entries_distributor_id_fkey"
FOREIGN KEY ("distributor_id") REFERENCES "distributors"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distributor_ledger_entries"
ADD CONSTRAINT "distributor_ledger_entries_sale_id_fkey"
FOREIGN KEY ("sale_id") REFERENCES "distributor_sales"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distributor_ledger_entries"
ADD CONSTRAINT "distributor_ledger_entries_settlement_id_fkey"
FOREIGN KEY ("settlement_id") REFERENCES "distributor_settlements"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "distributor_ledger_entries"
ADD CONSTRAINT "distributor_ledger_entries_payment_id_fkey"
FOREIGN KEY ("payment_id") REFERENCES "distributor_payments"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- DST-007 and DST-008: a direct sale is fully, partly, or not paid, and any
-- remainder is distributor receivable.
ALTER TABLE "distributor_sales"
ADD CONSTRAINT "distributor_sales_payment_state_consistency_check"
CHECK (
    "status" = 'CANCELLED'
    OR (
        "total_tnd" > 0
        AND "paid_amount_tnd" >= 0
        AND "paid_amount_tnd" <= "total_tnd"
        AND "remaining_due_tnd" = "total_tnd" - "paid_amount_tnd"
        AND (
            ("payment_state" = 'PAID' AND "remaining_due_tnd" = 0)
            OR ("payment_state" = 'PARTIALLY_PAID' AND "paid_amount_tnd" > 0 AND "remaining_due_tnd" > 0)
            OR ("payment_state" = 'UNPAID' AND "paid_amount_tnd" = 0 AND "remaining_due_tnd" > 0)
        )
    )
);

ALTER TABLE "distributor_sale_lines"
ADD CONSTRAINT "distributor_sale_lines_positive_quantity_check"
CHECK ("quantity" > 0 AND "unit_price_tnd" >= 0 AND "line_total_tnd" >= 0);

-- DST-022 and the source-of-truth quantity invariant: dispatched quantity is
-- the sum of settled sold, returned, still held, and unaccounted. Still held is
-- derived, so classified quantity may never exceed what was dispatched and no
-- unit can be classified twice.
ALTER TABLE "distributor_dispatch_lines"
ADD CONSTRAINT "distributor_dispatch_lines_custody_invariant_check"
CHECK (
    "dispatched_quantity" > 0
    AND "settled_sold_quantity" >= 0
    AND "returned_quantity" >= 0
    AND "unaccounted_quantity" >= 0
    AND "settled_sold_quantity" + "returned_quantity" + "unaccounted_quantity"
        <= "dispatched_quantity"
);

-- A settlement line must classify something, and the settled amount covers the
-- sold quantity only.
ALTER TABLE "distributor_settlement_lines"
ADD CONSTRAINT "distributor_settlement_lines_quantity_check"
CHECK (
    "sold_quantity" >= 0
    AND "returned_quantity" >= 0
    AND "unaccounted_quantity" >= 0
    AND "sold_quantity" + "returned_quantity" + "unaccounted_quantity" > 0
    AND "unit_price_tnd" >= 0
    AND "line_total_tnd" >= 0
);

-- A settlement of returns only is valid and totals zero, so the total is not
-- required to be positive here.
ALTER TABLE "distributor_settlements"
ADD CONSTRAINT "distributor_settlements_payment_state_consistency_check"
CHECK (
    "total_tnd" >= 0
    AND "paid_amount_tnd" >= 0
    AND "paid_amount_tnd" <= "total_tnd"
    AND "remaining_due_tnd" = "total_tnd" - "paid_amount_tnd"
    AND (
        ("payment_state" = 'PAID' AND "remaining_due_tnd" = 0)
        OR ("payment_state" = 'PARTIALLY_PAID' AND "paid_amount_tnd" > 0 AND "remaining_due_tnd" > 0)
        OR ("payment_state" = 'UNPAID' AND "paid_amount_tnd" = 0 AND "remaining_due_tnd" > 0)
    )
);

ALTER TABLE "distributor_payments"
ADD CONSTRAINT "distributor_payments_positive_amount_check"
CHECK ("amount_tnd" > 0);

-- An allocation targets exactly one receivable document.
ALTER TABLE "distributor_payment_allocations"
ADD CONSTRAINT "distributor_payment_allocations_single_target_check"
CHECK (
    "amount_tnd" > 0
    AND (("sale_id" IS NOT NULL)::int + ("settlement_id" IS NOT NULL)::int) = 1
);
