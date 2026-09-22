-- Sprint 17 (BE-36): one payment-method enum instead of five identical ones,
-- so a second method (OD-014) is one migration rather than five.
CREATE TYPE "PaymentMethod" AS ENUM ('CASH');
ALTER TABLE "supplier_payments" ALTER COLUMN "method" DROP DEFAULT,
  ALTER COLUMN "method" TYPE "PaymentMethod" USING "method"::text::"PaymentMethod",
  ALTER COLUMN "method" SET DEFAULT 'CASH';
ALTER TABLE "sale_payments" ALTER COLUMN "method" DROP DEFAULT,
  ALTER COLUMN "method" TYPE "PaymentMethod" USING "method"::text::"PaymentMethod",
  ALTER COLUMN "method" SET DEFAULT 'CASH';
ALTER TABLE "customer_payments" ALTER COLUMN "method" DROP DEFAULT,
  ALTER COLUMN "method" TYPE "PaymentMethod" USING "method"::text::"PaymentMethod",
  ALTER COLUMN "method" SET DEFAULT 'CASH';
ALTER TABLE "customer_order_advances" ALTER COLUMN "method" DROP DEFAULT,
  ALTER COLUMN "method" TYPE "PaymentMethod" USING "method"::text::"PaymentMethod",
  ALTER COLUMN "method" SET DEFAULT 'CASH';
ALTER TABLE "distributor_payments" ALTER COLUMN "method" DROP DEFAULT,
  ALTER COLUMN "method" TYPE "PaymentMethod" USING "method"::text::"PaymentMethod",
  ALTER COLUMN "method" SET DEFAULT 'CASH';
ALTER TABLE "expenses" ALTER COLUMN "method" DROP DEFAULT,
  ALTER COLUMN "method" TYPE "PaymentMethod" USING "method"::text::"PaymentMethod",
  ALTER COLUMN "method" SET DEFAULT 'CASH';
DROP TYPE "SupplierPaymentMethod";
DROP TYPE "SalePaymentMethod";
DROP TYPE "CustomerPaymentMethod";
DROP TYPE "DistributorPaymentMethod";
DROP TYPE "ExpensePaymentMethod";
