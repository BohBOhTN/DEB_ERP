-- R3 Sprint 7 POS paid sales foundation.
-- Adds the singleton POS terminal, POS sessions, paid sales, cash payments,
-- and the database-level one-active-session guard.

CREATE TYPE "PosSessionStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "SaleStatus" AS ENUM ('POSTED', 'CANCELLED');
CREATE TYPE "SalePaymentState" AS ENUM ('PAID', 'PARTIALLY_PAID', 'UNPAID');
CREATE TYPE "SalePaymentMethod" AS ENUM ('CASH');

CREATE TABLE "pos_terminals" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_terminals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_sessions" (
    "id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "status" "PosSessionStatus" NOT NULL DEFAULT 'OPEN',
    "opened_at" TIMESTAMP(3) NOT NULL,
    "opened_by_user_id" TEXT NOT NULL,
    "opening_cash_tnd" DECIMAL(14,3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "closed_by_user_id" TEXT,
    "counted_cash_tnd" DECIMAL(14,3),
    "expected_cash_tnd" DECIMAL(14,3),
    "cash_difference_tnd" DECIMAL(14,3),
    "notes" TEXT,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'POSTED',
    "payment_state" "SalePaymentState" NOT NULL DEFAULT 'PAID',
    "sold_at" TIMESTAMP(3) NOT NULL,
    "total_tnd" DECIMAL(14,3) NOT NULL,
    "paid_amount_tnd" DECIMAL(14,3) NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL,
    "posted_by_user_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_lines" (
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

    CONSTRAINT "sale_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_payments" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "amount_tnd" DECIMAL(14,3) NOT NULL,
    "method" "SalePaymentMethod" NOT NULL DEFAULT 'CASH',
    "paid_at" TIMESTAMP(3) NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_terminals_code_key" ON "pos_terminals"("code");
CREATE INDEX "pos_terminals_is_active_idx" ON "pos_terminals"("is_active");
CREATE INDEX "pos_sessions_terminal_id_idx" ON "pos_sessions"("terminal_id");
CREATE INDEX "pos_sessions_status_idx" ON "pos_sessions"("status");
CREATE INDEX "pos_sessions_opened_at_idx" ON "pos_sessions"("opened_at");
CREATE UNIQUE INDEX "pos_sessions_one_open_session_idx"
ON "pos_sessions"("terminal_id")
WHERE "status" = 'OPEN';
CREATE INDEX "sales_session_id_idx" ON "sales"("session_id");
CREATE INDEX "sales_status_idx" ON "sales"("status");
CREATE INDEX "sales_sold_at_idx" ON "sales"("sold_at");
CREATE INDEX "sale_lines_sale_id_idx" ON "sale_lines"("sale_id");
CREATE INDEX "sale_lines_product_id_idx" ON "sale_lines"("product_id");
CREATE INDEX "sale_lines_unit_id_idx" ON "sale_lines"("unit_id");
CREATE INDEX "sale_payments_sale_id_idx" ON "sale_payments"("sale_id");
CREATE INDEX "sale_payments_session_id_idx" ON "sale_payments"("session_id");
CREATE INDEX "sale_payments_paid_at_idx" ON "sale_payments"("paid_at");

ALTER TABLE "pos_sessions"
ADD CONSTRAINT "pos_sessions_terminal_id_fkey"
FOREIGN KEY ("terminal_id") REFERENCES "pos_terminals"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales"
ADD CONSTRAINT "sales_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "pos_sessions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_lines"
ADD CONSTRAINT "sale_lines_sale_id_fkey"
FOREIGN KEY ("sale_id") REFERENCES "sales"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sale_lines"
ADD CONSTRAINT "sale_lines_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_lines"
ADD CONSTRAINT "sale_lines_unit_id_fkey"
FOREIGN KEY ("unit_id") REFERENCES "units"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_payments"
ADD CONSTRAINT "sale_payments_sale_id_fkey"
FOREIGN KEY ("sale_id") REFERENCES "sales"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_payments"
ADD CONSTRAINT "sale_payments_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "pos_sessions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_sessions"
ADD CONSTRAINT "pos_sessions_opening_cash_non_negative_check"
CHECK ("opening_cash_tnd" >= 0);

ALTER TABLE "pos_sessions"
ADD CONSTRAINT "pos_sessions_counted_cash_non_negative_check"
CHECK ("counted_cash_tnd" IS NULL OR "counted_cash_tnd" >= 0);

ALTER TABLE "pos_sessions"
ADD CONSTRAINT "pos_sessions_closed_fields_check"
CHECK (
    ("status" = 'OPEN' AND "closed_at" IS NULL AND "closed_by_user_id" IS NULL
        AND "counted_cash_tnd" IS NULL AND "expected_cash_tnd" IS NULL
        AND "cash_difference_tnd" IS NULL)
    OR
    ("status" = 'CLOSED' AND "closed_at" IS NOT NULL AND "closed_by_user_id" IS NOT NULL
        AND "counted_cash_tnd" IS NOT NULL AND "expected_cash_tnd" IS NOT NULL
        AND "cash_difference_tnd" IS NOT NULL)
);

ALTER TABLE "sales"
ADD CONSTRAINT "sales_paid_direct_sale_check"
CHECK (
    "status" = 'CANCELLED'
    OR ("payment_state" = 'PAID' AND "total_tnd" > 0 AND "paid_amount_tnd" = "total_tnd")
);

ALTER TABLE "sale_lines"
ADD CONSTRAINT "sale_lines_positive_values_check"
CHECK ("quantity" > 0 AND "unit_price_tnd" >= 0 AND "line_total_tnd" >= 0);

ALTER TABLE "sale_payments"
ADD CONSTRAINT "sale_payments_positive_amount_check"
CHECK ("amount_tnd" > 0);

INSERT INTO "pos_terminals" ("id", "code", "name", "is_active", "updated_at")
VALUES ('main-pos', 'main', 'Caisse principale', true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "is_active" = true,
    "updated_at" = CURRENT_TIMESTAMP;
