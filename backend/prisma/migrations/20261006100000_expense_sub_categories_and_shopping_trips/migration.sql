-- Issue 018: sub-categories of expenses, and the store and purchase an
-- expense recorded on a shopping trip belongs to. Additive; nothing is
-- backfilled: existing categories stay at the top level and existing
-- expenses keep no supplier and no purchase.
ALTER TABLE "expense_categories" ADD COLUMN "parent_id" TEXT;

CREATE INDEX "expense_categories_parent_id_idx" ON "expense_categories"("parent_id");

ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expenses" ADD COLUMN "supplier_id" TEXT,
ADD COLUMN "purchase_id" TEXT;

CREATE INDEX "expenses_supplier_id_idx" ON "expenses"("supplier_id");

CREATE INDEX "expenses_purchase_id_idx" ON "expenses"("purchase_id");

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
