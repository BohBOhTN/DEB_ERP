-- CreateEnum
CREATE TYPE "InventoryItemType" AS ENUM ('PRODUCT', 'RAW_MATERIAL');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM (
    'OPENING_STOCK',
    'PURCHASE_RECEIPT',
    'POS_SALE',
    'ORDER_SALE',
    'DISTRIBUTOR_DIRECT_SALE',
    'DISTRIBUTOR_DISPATCH_OUT',
    'DISTRIBUTOR_RETURN_IN',
    'DISTRIBUTOR_SETTLED_SALE',
    'STOCK_ADJUSTMENT_INCREASE',
    'STOCK_ADJUSTMENT_DECREASE',
    'REVERSAL'
);

-- CreateTable
CREATE TABLE "stock_locations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "item_type" "InventoryItemType" NOT NULL,
    "product_id" TEXT,
    "raw_material_id" TEXT,
    "unit_id" TEXT NOT NULL,
    "movement_type" "InventoryMovementType" NOT NULL,
    "quantity_delta" DECIMAL(18,6) NOT NULL,
    "item_name_snapshot" TEXT NOT NULL,
    "unit_name_snapshot" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "reason" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_user_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_locations_code_key" ON "stock_locations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "stock_locations_one_main_key" ON "stock_locations"("is_main") WHERE "is_main" = true;

-- CreateIndex
CREATE INDEX "stock_locations_is_active_idx" ON "stock_locations"("is_active");

-- CreateIndex
CREATE INDEX "inventory_movements_location_id_idx" ON "inventory_movements"("location_id");

-- CreateIndex
CREATE INDEX "inventory_movements_product_id_idx" ON "inventory_movements"("product_id");

-- CreateIndex
CREATE INDEX "inventory_movements_raw_material_id_idx" ON "inventory_movements"("raw_material_id");

-- CreateIndex
CREATE INDEX "inventory_movements_unit_id_idx" ON "inventory_movements"("unit_id");

-- CreateIndex
CREATE INDEX "inventory_movements_movement_type_idx" ON "inventory_movements"("movement_type");

-- CreateIndex
CREATE INDEX "inventory_movements_occurred_at_idx" ON "inventory_movements"("occurred_at");

-- AddCheck
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_quantity_delta_check" CHECK ("quantity_delta" <> 0);

-- AddCheck
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_reference_check" CHECK (
    ("item_type" = 'PRODUCT' AND "product_id" IS NOT NULL AND "raw_material_id" IS NULL)
    OR
    ("item_type" = 'RAW_MATERIAL' AND "raw_material_id" IS NOT NULL AND "product_id" IS NULL)
);

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "stock_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
