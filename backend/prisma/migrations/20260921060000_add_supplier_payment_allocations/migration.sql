-- CreateTable
CREATE TABLE "supplier_payment_allocations" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "amount_tnd" DECIMAL(14,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payment_allocations_payment_id_purchase_id_key" ON "supplier_payment_allocations"("payment_id", "purchase_id");

-- CreateIndex
CREATE INDEX "supplier_payment_allocations_purchase_id_idx" ON "supplier_payment_allocations"("purchase_id");

-- AddCheck
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_positive_amount_check" CHECK ("amount_tnd" > 0);

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
