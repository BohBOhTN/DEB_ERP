-- Issue 023, DEC-V2-013: every sale price a product had, with the moment
-- it took effect. Backfilled with the price each existing product has now,
-- dated by its last update, so every product starts with one point.
CREATE TABLE "product_sale_price_history" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sale_price_tnd" DECIMAL(12,3) NOT NULL,
    "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_sale_price_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_sale_price_history_product_id_effective_at_idx" ON "product_sale_price_history"("product_id", "effective_at");

ALTER TABLE "product_sale_price_history" ADD CONSTRAINT "product_sale_price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "product_sale_price_history" ("id", "product_id", "sale_price_tnd", "effective_at", "actor_user_id", "created_at")
SELECT
    'psph_' || "id",
    "id",
    "sale_price_tnd",
    "updated_at",
    "updated_by_user_id",
    CURRENT_TIMESTAMP
FROM "products";
