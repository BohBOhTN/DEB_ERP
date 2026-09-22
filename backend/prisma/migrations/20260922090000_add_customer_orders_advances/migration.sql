-- R3 Sprint 9 customer orders and advances foundation.
-- Adds customer orders, order lines, order advances, and the advance balance
-- dimension of the customer ledger. An order recognizes no revenue and moves no
-- stock; completion links exactly one sale.

CREATE TYPE "CustomerLedgerBalanceKind" AS ENUM ('RECEIVABLE', 'ADVANCE');
CREATE TYPE "CustomerOrderStatus" AS ENUM (
    'DRAFT',
    'CONFIRMED',
    'PREPARING',
    'READY',
    'COMPLETED',
    'CANCELLED'
);
CREATE TYPE "CustomerOrderAdvanceMovement" AS ENUM ('RECEIPT', 'REFUND');
CREATE TYPE "CustomerOrderAdvanceDisposition" AS ENUM ('REFUNDED', 'CREDITED');

-- Gap-free-enough human reference for the order queue. A sequence keeps
-- concurrent order creation collision-free without counting rows.
CREATE SEQUENCE "customer_order_reference_seq" START WITH 1 INCREMENT BY 1;

ALTER TYPE "CustomerLedgerEntryType" ADD VALUE 'ORDER_ADVANCE';
ALTER TYPE "CustomerLedgerEntryType" ADD VALUE 'ORDER_ADVANCE_APPLIED';
ALTER TYPE "CustomerLedgerEntryType" ADD VALUE 'ORDER_ADVANCE_REFUNDED';
ALTER TYPE "CustomerLedgerEntryType" ADD VALUE 'ORDER_ADVANCE_CREDITED';

CREATE TABLE "customer_orders" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" "CustomerOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "requested_fulfillment_at" TIMESTAMP(3) NOT NULL,
    "total_tnd" DECIMAL(14,3) NOT NULL,
    "advance_balance_tnd" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sale_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "completed_by_user_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_user_id" TEXT,
    "cancellation_reason" TEXT,
    "advance_disposition" "CustomerOrderAdvanceDisposition",
    "created_by_user_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_order_lines" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unit_price_tnd" DECIMAL(14,3) NOT NULL,
    "line_total_tnd" DECIMAL(14,3) NOT NULL,
    "product_name_snapshot" TEXT NOT NULL,
    "unit_name_snapshot" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_order_advances" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "movement" "CustomerOrderAdvanceMovement" NOT NULL DEFAULT 'RECEIPT',
    "amount_tnd" DECIMAL(14,3) NOT NULL,
    "method" "CustomerPaymentMethod" NOT NULL DEFAULT 'CASH',
    "paid_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "actor_user_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_order_advances_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "customer_ledger_entries"
ADD COLUMN "order_id" TEXT,
ADD COLUMN "balance_kind" "CustomerLedgerBalanceKind" NOT NULL DEFAULT 'RECEIVABLE';

CREATE UNIQUE INDEX "customer_orders_reference_key" ON "customer_orders"("reference");
CREATE UNIQUE INDEX "customer_orders_sale_id_key" ON "customer_orders"("sale_id");
CREATE INDEX "customer_orders_customer_id_idx" ON "customer_orders"("customer_id");
CREATE INDEX "customer_orders_status_idx" ON "customer_orders"("status");
CREATE INDEX "customer_orders_requested_fulfillment_at_idx"
ON "customer_orders"("requested_fulfillment_at");
CREATE UNIQUE INDEX "customer_order_lines_order_id_product_id_key"
ON "customer_order_lines"("order_id", "product_id");
CREATE INDEX "customer_order_lines_order_id_idx" ON "customer_order_lines"("order_id");
CREATE INDEX "customer_order_lines_product_id_idx" ON "customer_order_lines"("product_id");
CREATE INDEX "customer_order_lines_unit_id_idx" ON "customer_order_lines"("unit_id");
CREATE INDEX "customer_order_advances_order_id_idx" ON "customer_order_advances"("order_id");
CREATE INDEX "customer_order_advances_customer_id_idx" ON "customer_order_advances"("customer_id");
CREATE INDEX "customer_order_advances_session_id_idx" ON "customer_order_advances"("session_id");
CREATE INDEX "customer_order_advances_paid_at_idx" ON "customer_order_advances"("paid_at");
CREATE INDEX "customer_ledger_entries_order_id_idx" ON "customer_ledger_entries"("order_id");
CREATE INDEX "customer_ledger_entries_balance_kind_idx"
ON "customer_ledger_entries"("balance_kind");

ALTER TABLE "customer_orders"
ADD CONSTRAINT "customer_orders_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_orders"
ADD CONSTRAINT "customer_orders_sale_id_fkey"
FOREIGN KEY ("sale_id") REFERENCES "sales"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_order_lines"
ADD CONSTRAINT "customer_order_lines_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "customer_orders"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_order_lines"
ADD CONSTRAINT "customer_order_lines_product_id_fkey"
FOREIGN KEY ("product_id") REFERENCES "products"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_order_lines"
ADD CONSTRAINT "customer_order_lines_unit_id_fkey"
FOREIGN KEY ("unit_id") REFERENCES "units"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_order_advances"
ADD CONSTRAINT "customer_order_advances_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "customer_orders"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_order_advances"
ADD CONSTRAINT "customer_order_advances_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_order_advances"
ADD CONSTRAINT "customer_order_advances_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "pos_sessions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_ledger_entries"
ADD CONSTRAINT "customer_ledger_entries_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "customer_orders"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_orders"
ADD CONSTRAINT "customer_orders_total_positive_check"
CHECK ("total_tnd" > 0);

-- ORD-016: advances held can never exceed the current order total and can
-- never go negative.
ALTER TABLE "customer_orders"
ADD CONSTRAINT "customer_orders_advance_balance_check"
CHECK ("advance_balance_tnd" >= 0 AND "advance_balance_tnd" <= "total_tnd");

-- ORD-010 and ORD-012: a completed order carries exactly one linked sale, and a
-- linked sale exists only on a completed order.
ALTER TABLE "customer_orders"
ADD CONSTRAINT "customer_orders_completion_check"
CHECK (
    ("status" = 'COMPLETED' AND "sale_id" IS NOT NULL AND "completed_at" IS NOT NULL)
    OR ("status" <> 'COMPLETED' AND "sale_id" IS NULL AND "completed_at" IS NULL)
);

-- ORD-013: a cancelled order retains its reason and actor.
ALTER TABLE "customer_orders"
ADD CONSTRAINT "customer_orders_cancellation_check"
CHECK (
    ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "cancellation_reason" IS NOT NULL)
    OR ("status" <> 'CANCELLED' AND "cancelled_at" IS NULL AND "cancellation_reason" IS NULL)
);

-- ORD-017 and ORD-018: money cannot disappear. A terminal order holds no
-- advance; it was applied, refunded, or converted to customer credit.
ALTER TABLE "customer_orders"
ADD CONSTRAINT "customer_orders_terminal_advance_settled_check"
CHECK (
    "status" NOT IN ('COMPLETED', 'CANCELLED')
    OR "advance_balance_tnd" = 0
);

ALTER TABLE "customer_order_lines"
ADD CONSTRAINT "customer_order_lines_positive_quantity_check"
CHECK ("quantity" > 0 AND "unit_price_tnd" >= 0 AND "line_total_tnd" >= 0);

ALTER TABLE "customer_order_advances"
ADD CONSTRAINT "customer_order_advances_positive_amount_check"
CHECK ("amount_tnd" > 0);
