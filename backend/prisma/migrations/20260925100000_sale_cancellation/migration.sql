-- Issue #44: a posted sale can be cancelled. The sale keeps its figures and
-- gains the cancellation trail; the cash it took comes back through a
-- refund payment in the open drawer; the stock returns through a reversal
-- movement. Everything here is additive.
ALTER TABLE "sales"
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_by_user_id" TEXT,
  ADD COLUMN "cancellation_reason" TEXT;
CREATE INDEX "sales_status_sold_at_idx" ON "sales"("status", "sold_at");

CREATE TYPE "SalePaymentMovement" AS ENUM ('RECEIPT', 'REFUND');
ALTER TABLE "sale_payments"
  ADD COLUMN "movement" "SalePaymentMovement" NOT NULL DEFAULT 'RECEIPT';

ALTER TYPE "InventorySourceType" ADD VALUE 'POS_SALE_CANCELLATION';
