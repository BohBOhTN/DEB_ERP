-- Issue 019, DEC-V2-010: products bought to be resold, and purchase lines
-- that buy them. Additive: every existing product stays "made here" and
-- every existing line keeps its raw material.
ALTER TABLE "products" ADD COLUMN "is_resale" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "purchase_lines" ADD COLUMN "product_id" TEXT;

ALTER TABLE "purchase_lines" ALTER COLUMN "raw_material_id" DROP NOT NULL;

CREATE INDEX "purchase_lines_product_id_idx" ON "purchase_lines"("product_id");

ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A line buys exactly one item: a raw material or a resold product.
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_one_item_check"
CHECK (("raw_material_id" IS NULL) <> ("product_id" IS NULL));

-- A resold product is always stock-tracked.
ALTER TABLE "products" ADD CONSTRAINT "products_resale_is_stockable_check"
CHECK (NOT "is_resale" OR "is_stockable");
