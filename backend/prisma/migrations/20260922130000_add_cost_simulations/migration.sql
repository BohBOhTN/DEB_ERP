-- R4 Sprint 12 ingredient cost simulation.
-- Planning only. SIM-003: a simulation has no inventory, supplier, customer,
-- revenue, payment, or expense effect, so these tables are referenced by
-- nothing in the operational domain and reference nothing that posts.

CREATE TABLE "cost_simulations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target_product_id" TEXT,
    "output_quantity" DECIMAL(18,6) NOT NULL,
    "output_unit_id" TEXT NOT NULL,
    "notes" TEXT,
    "total_ingredient_cost_tnd" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "cost_per_output_unit_tnd" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "output_unit_name_snapshot" TEXT NOT NULL,
    "target_product_name_snapshot" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_simulations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cost_simulation_ingredients" (
    "id" TEXT NOT NULL,
    "simulation_id" TEXT NOT NULL,
    "raw_material_id" TEXT,
    "ingredient_name" TEXT NOT NULL,
    "entered_quantity" DECIMAL(18,6) NOT NULL,
    "entered_unit_id" TEXT NOT NULL,
    "conversion_factor_to_base" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "base_quantity" DECIMAL(18,6) NOT NULL,
    "unit_price_tnd" DECIMAL(14,3) NOT NULL,
    "price_basis_unit_id" TEXT NOT NULL,
    "line_cost_tnd" DECIMAL(14,3) NOT NULL,
    "entered_unit_name_snapshot" TEXT NOT NULL,
    "price_basis_unit_name_snapshot" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_simulation_ingredients_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cost_simulations_target_product_id_idx" ON "cost_simulations"("target_product_id");
CREATE INDEX "cost_simulations_output_unit_id_idx" ON "cost_simulations"("output_unit_id");
CREATE INDEX "cost_simulations_name_idx" ON "cost_simulations"("name");
CREATE INDEX "cost_simulation_ingredients_simulation_id_idx"
ON "cost_simulation_ingredients"("simulation_id");
CREATE INDEX "cost_simulation_ingredients_raw_material_id_idx"
ON "cost_simulation_ingredients"("raw_material_id");
CREATE INDEX "cost_simulation_ingredients_entered_unit_id_idx"
ON "cost_simulation_ingredients"("entered_unit_id");
CREATE INDEX "cost_simulation_ingredients_price_basis_unit_id_idx"
ON "cost_simulation_ingredients"("price_basis_unit_id");

ALTER TABLE "cost_simulations"
ADD CONSTRAINT "cost_simulations_target_product_id_fkey"
FOREIGN KEY ("target_product_id") REFERENCES "products"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cost_simulations"
ADD CONSTRAINT "cost_simulations_output_unit_id_fkey"
FOREIGN KEY ("output_unit_id") REFERENCES "units"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cost_simulation_ingredients"
ADD CONSTRAINT "cost_simulation_ingredients_simulation_id_fkey"
FOREIGN KEY ("simulation_id") REFERENCES "cost_simulations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cost_simulation_ingredients"
ADD CONSTRAINT "cost_simulation_ingredients_raw_material_id_fkey"
FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cost_simulation_ingredients"
ADD CONSTRAINT "cost_simulation_ingredients_entered_unit_id_fkey"
FOREIGN KEY ("entered_unit_id") REFERENCES "units"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cost_simulation_ingredients"
ADD CONSTRAINT "cost_simulation_ingredients_price_basis_unit_id_fkey"
FOREIGN KEY ("price_basis_unit_id") REFERENCES "units"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Validation from section 16.3: the output quantity must be greater than zero,
-- so cost per final product can never divide by zero.
ALTER TABLE "cost_simulations"
ADD CONSTRAINT "cost_simulations_positive_output_check"
CHECK ("output_quantity" > 0);

ALTER TABLE "cost_simulations"
ADD CONSTRAINT "cost_simulations_non_negative_cost_check"
CHECK ("total_ingredient_cost_tnd" >= 0 AND "cost_per_output_unit_tnd" >= 0);

-- Ingredient quantity must be greater than zero, the unit price cannot be
-- negative, and the conversion factor must be positive.
ALTER TABLE "cost_simulation_ingredients"
ADD CONSTRAINT "cost_simulation_ingredients_amounts_check"
CHECK (
    "entered_quantity" > 0
    AND "base_quantity" > 0
    AND "conversion_factor_to_base" > 0
    AND "unit_price_tnd" >= 0
    AND "line_cost_tnd" >= 0
);
