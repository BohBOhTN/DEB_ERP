-- Issue 008: an approximate cost per product, typed by the owner per base
-- unit, and its snapshot on every sold line so a later edit never rewrites
-- the margin of a past day. Additive; nothing is backfilled.
ALTER TABLE "products" ADD COLUMN "approximate_cost_tnd" DECIMAL(12,3);
ALTER TABLE "products" ADD CONSTRAINT "products_approximate_cost_check" CHECK (
    "approximate_cost_tnd" IS NULL OR "approximate_cost_tnd" >= 0
);

ALTER TABLE "sale_lines" ADD COLUMN "unit_cost_tnd" DECIMAL(14,3);
ALTER TABLE "distributor_sale_lines" ADD COLUMN "unit_cost_tnd" DECIMAL(14,3);
ALTER TABLE "distributor_settlement_lines" ADD COLUMN "unit_cost_tnd" DECIMAL(14,3);
