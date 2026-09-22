-- Sprint 17 (BE-33): the movement source is a closed set; a typo can no
-- longer create a new kind of source. Values match what the services wrote.
CREATE TYPE "InventorySourceType" AS ENUM (
  'OPENING_STOCK',
  'STOCK_ADJUSTMENT',
  'PURCHASE',
  'PURCHASE_CANCELLATION',
  'POS_SALE',
  'CUSTOMER_ORDER_SALE',
  'DISTRIBUTOR_DIRECT_SALE',
  'DISTRIBUTOR_DISPATCH',
  'DISTRIBUTOR_SETTLEMENT'
);
ALTER TABLE "inventory_movements"
  ALTER COLUMN "source_type" TYPE "InventorySourceType"
  USING "source_type"::"InventorySourceType";
CREATE INDEX "inventory_movements_source_type_idx" ON "inventory_movements"("source_type");
