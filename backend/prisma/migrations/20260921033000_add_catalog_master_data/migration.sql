-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "precision" INTEGER NOT NULL DEFAULT 3,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "base_unit_id" TEXT NOT NULL,
    "sale_price_tnd" DECIMAL(12,3) NOT NULL,
    "is_stockable" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_materials" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "category" TEXT,
    "base_unit_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_material_unit_conversions" (
    "id" TEXT NOT NULL,
    "raw_material_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "factor_to_base" DECIMAL(18,6) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_material_unit_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "units_code_key" ON "units"("code");

-- CreateIndex
CREATE INDEX "units_is_active_idx" ON "units"("is_active");

-- CreateIndex
CREATE INDEX "product_categories_is_active_idx" ON "product_categories"("is_active");

-- CreateIndex
CREATE INDEX "product_categories_normalized_name_idx" ON "product_categories"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_active_normalized_name_key" ON "product_categories"("normalized_name") WHERE "is_active" = true;

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_base_unit_id_idx" ON "products"("base_unit_id");

-- CreateIndex
CREATE INDEX "products_is_active_idx" ON "products"("is_active");

-- CreateIndex
CREATE INDEX "products_normalized_name_idx" ON "products"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "products_active_normalized_name_key" ON "products"("normalized_name") WHERE "is_active" = true;

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code") WHERE "code" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode") WHERE "barcode" IS NOT NULL;

-- CreateIndex
CREATE INDEX "raw_materials_base_unit_id_idx" ON "raw_materials"("base_unit_id");

-- CreateIndex
CREATE INDEX "raw_materials_is_active_idx" ON "raw_materials"("is_active");

-- CreateIndex
CREATE INDEX "raw_materials_normalized_name_idx" ON "raw_materials"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "raw_materials_active_normalized_name_key" ON "raw_materials"("normalized_name") WHERE "is_active" = true;

-- CreateIndex
CREATE UNIQUE INDEX "raw_materials_code_key" ON "raw_materials"("code") WHERE "code" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "raw_material_unit_conversions_raw_material_id_unit_id_key" ON "raw_material_unit_conversions"("raw_material_id", "unit_id");

-- CreateIndex
CREATE INDEX "raw_material_unit_conversions_unit_id_idx" ON "raw_material_unit_conversions"("unit_id");

-- CreateIndex
CREATE INDEX "raw_material_unit_conversions_is_active_idx" ON "raw_material_unit_conversions"("is_active");

-- AddCheck
ALTER TABLE "units" ADD CONSTRAINT "units_precision_check" CHECK ("precision" >= 0);

-- AddCheck
ALTER TABLE "products" ADD CONSTRAINT "products_sale_price_tnd_check" CHECK ("sale_price_tnd" >= 0);

-- AddCheck
ALTER TABLE "products" ADD CONSTRAINT "products_version_check" CHECK ("version" > 0);

-- AddCheck
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_version_check" CHECK ("version" > 0);

-- AddCheck
ALTER TABLE "raw_material_unit_conversions" ADD CONSTRAINT "raw_material_unit_conversions_factor_to_base_check" CHECK ("factor_to_base" > 0);

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_base_unit_id_fkey" FOREIGN KEY ("base_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_base_unit_id_fkey" FOREIGN KEY ("base_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_unit_conversions" ADD CONSTRAINT "raw_material_unit_conversions_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_unit_conversions" ADD CONSTRAINT "raw_material_unit_conversions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
