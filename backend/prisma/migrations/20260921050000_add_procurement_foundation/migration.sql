-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchasePaymentTerms" AS ENUM ('PAID', 'PARTIAL', 'UNPAID');

-- CreateEnum
CREATE TYPE "SupplierPaymentMethod" AS ENUM ('CASH');

-- CreateEnum
CREATE TYPE "SupplierLedgerEntryType" AS ENUM (
    'PURCHASE_PAYABLE',
    'PAYMENT',
    'PURCHASE_REVERSAL',
    'PAYMENT_REVERSAL'
);

-- CreateTable
CREATE TABLE "suppliers" (
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

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "purchase_date" TIMESTAMP(3) NOT NULL,
    "supplier_reference" TEXT,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "payment_terms" "PurchasePaymentTerms" NOT NULL,
    "due_date" TIMESTAMP(3),
    "total_tnd" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "paid_amount_tnd" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "posted_at" TIMESTAMP(3),
    "posted_by_user_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_user_id" TEXT,
    "cancellation_reason" TEXT,
    "correlation_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_lines" (
    "id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "raw_material_id" TEXT NOT NULL,
    "entered_unit_id" TEXT NOT NULL,
    "base_unit_id" TEXT NOT NULL,
    "entered_quantity" DECIMAL(18,6) NOT NULL,
    "conversion_factor_to_base" DECIMAL(18,6) NOT NULL,
    "normalized_quantity" DECIMAL(18,6) NOT NULL,
    "unit_price_tnd" DECIMAL(14,3) NOT NULL,
    "line_total_tnd" DECIMAL(14,3) NOT NULL,
    "raw_material_name_snapshot" TEXT NOT NULL,
    "entered_unit_name_snapshot" TEXT NOT NULL,
    "base_unit_name_snapshot" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "purchase_id" TEXT,
    "amount_tnd" DECIMAL(14,3) NOT NULL,
    "method" "SupplierPaymentMethod" NOT NULL DEFAULT 'CASH',
    "paid_at" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "actor_user_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_ledger_entries" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "purchase_id" TEXT,
    "payment_id" TEXT,
    "entry_type" "SupplierLedgerEntryType" NOT NULL,
    "amount_tnd" DECIMAL(14,3) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suppliers_is_active_idx" ON "suppliers"("is_active");

-- CreateIndex
CREATE INDEX "suppliers_normalized_name_idx" ON "suppliers"("normalized_name");

-- CreateIndex
CREATE INDEX "purchases_supplier_id_idx" ON "purchases"("supplier_id");

-- CreateIndex
CREATE INDEX "purchases_purchase_date_idx" ON "purchases"("purchase_date");

-- CreateIndex
CREATE INDEX "purchases_status_idx" ON "purchases"("status");

-- CreateIndex
CREATE INDEX "purchases_due_date_idx" ON "purchases"("due_date");

-- CreateIndex
CREATE INDEX "purchase_lines_purchase_id_idx" ON "purchase_lines"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_lines_raw_material_id_idx" ON "purchase_lines"("raw_material_id");

-- CreateIndex
CREATE INDEX "purchase_lines_entered_unit_id_idx" ON "purchase_lines"("entered_unit_id");

-- CreateIndex
CREATE INDEX "purchase_lines_base_unit_id_idx" ON "purchase_lines"("base_unit_id");

-- CreateIndex
CREATE INDEX "supplier_payments_supplier_id_idx" ON "supplier_payments"("supplier_id");

-- CreateIndex
CREATE INDEX "supplier_payments_purchase_id_idx" ON "supplier_payments"("purchase_id");

-- CreateIndex
CREATE INDEX "supplier_payments_paid_at_idx" ON "supplier_payments"("paid_at");

-- CreateIndex
CREATE INDEX "supplier_ledger_entries_supplier_id_idx" ON "supplier_ledger_entries"("supplier_id");

-- CreateIndex
CREATE INDEX "supplier_ledger_entries_purchase_id_idx" ON "supplier_ledger_entries"("purchase_id");

-- CreateIndex
CREATE INDEX "supplier_ledger_entries_payment_id_idx" ON "supplier_ledger_entries"("payment_id");

-- CreateIndex
CREATE INDEX "supplier_ledger_entries_occurred_at_idx" ON "supplier_ledger_entries"("occurred_at");

-- AddCheck
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_name_required_check" CHECK (length(trim("name")) > 0);

-- AddCheck
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_amounts_check" CHECK (
    "total_tnd" >= 0
    AND "paid_amount_tnd" >= 0
    AND "paid_amount_tnd" <= "total_tnd"
);

-- AddCheck
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_payment_terms_check" CHECK (
    ("payment_terms" = 'PAID' AND "paid_amount_tnd" = "total_tnd" AND "due_date" IS NULL)
    OR
    ("payment_terms" = 'PARTIAL' AND "paid_amount_tnd" > 0 AND "paid_amount_tnd" < "total_tnd" AND "due_date" IS NOT NULL)
    OR
    ("payment_terms" = 'UNPAID' AND "paid_amount_tnd" = 0 AND "total_tnd" > 0 AND "due_date" IS NOT NULL)
);

-- AddCheck
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_posted_metadata_check" CHECK (
    ("status" = 'DRAFT' AND "posted_at" IS NULL AND "posted_by_user_id" IS NULL)
    OR
    ("status" IN ('POSTED', 'CANCELLED') AND "posted_at" IS NOT NULL AND "posted_by_user_id" IS NOT NULL)
);

-- AddCheck
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_cancelled_metadata_check" CHECK (
    ("status" <> 'CANCELLED' AND "cancelled_at" IS NULL AND "cancelled_by_user_id" IS NULL AND "cancellation_reason" IS NULL)
    OR
    ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "cancelled_by_user_id" IS NOT NULL AND length(trim("cancellation_reason")) >= 3)
);

-- AddCheck
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_positive_values_check" CHECK (
    "entered_quantity" > 0
    AND "conversion_factor_to_base" > 0
    AND "normalized_quantity" > 0
    AND "unit_price_tnd" > 0
    AND "line_total_tnd" > 0
);

-- AddCheck
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_positive_amount_check" CHECK ("amount_tnd" > 0);

-- AddCheck
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_non_zero_amount_check" CHECK ("amount_tnd" <> 0);

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_entered_unit_id_fkey" FOREIGN KEY ("entered_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_base_unit_id_fkey" FOREIGN KEY ("base_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "supplier_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
