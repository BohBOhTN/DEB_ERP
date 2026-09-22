-- R4 Sprint 11 expenses.
-- Adds dynamic expense categories and expense records with a
-- draft/post/cancel lifecycle. An expense has no stock and no party-balance
-- effect; treasury accounts and payroll stay deferred (EXP-009, EXP-010).

CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');
CREATE TYPE "ExpensePaymentMethod" AS ENUM ('CASH');

CREATE SEQUENCE "expense_reference_seq" START WITH 1 INCREMENT BY 1;

CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "expense_date" TIMESTAMP(3) NOT NULL,
    "amount_tnd" DECIMAL(14,3) NOT NULL,
    "description" TEXT NOT NULL,
    "external_reference" TEXT,
    "method" "ExpensePaymentMethod" NOT NULL DEFAULT 'CASH',
    "notes" TEXT,
    "responsible_user_id" TEXT NOT NULL,
    "posted_at" TIMESTAMP(3),
    "posted_by_user_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_user_id" TEXT,
    "cancellation_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" TEXT NOT NULL,
    "updated_by_user_id" TEXT NOT NULL,
    "correlation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expense_categories_is_active_idx" ON "expense_categories"("is_active");
CREATE INDEX "expense_categories_normalized_name_idx"
ON "expense_categories"("normalized_name");

CREATE UNIQUE INDEX "expenses_reference_key" ON "expenses"("reference");
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");
CREATE INDEX "expenses_status_idx" ON "expenses"("status");
CREATE INDEX "expenses_expense_date_idx" ON "expenses"("expense_date");

ALTER TABLE "expenses"
ADD CONSTRAINT "expenses_category_id_fkey"
FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- EXP-006: the amount must be greater than zero.
ALTER TABLE "expenses"
ADD CONSTRAINT "expenses_positive_amount_check"
CHECK ("amount_tnd" > 0);

-- EXP-007: a posted expense carries its posting evidence.
ALTER TABLE "expenses"
ADD CONSTRAINT "expenses_posted_check"
CHECK (
    "status" = 'DRAFT'
    OR ("posted_at" IS NOT NULL AND "posted_by_user_id" IS NOT NULL)
);

-- EXP-008: cancellation requires a reason and an actor, and a record that is
-- not cancelled carries none of that.
ALTER TABLE "expenses"
ADD CONSTRAINT "expenses_cancellation_check"
CHECK (
    (
        "status" = 'CANCELLED'
        AND "cancelled_at" IS NOT NULL
        AND "cancelled_by_user_id" IS NOT NULL
        AND "cancellation_reason" IS NOT NULL
    )
    OR (
        "status" <> 'CANCELLED'
        AND "cancelled_at" IS NULL
        AND "cancelled_by_user_id" IS NULL
        AND "cancellation_reason" IS NULL
    )
);
