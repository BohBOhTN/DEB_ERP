-- Sprint 17 (BE-32): human-readable document numbers for sales and purchases,
-- like orders (CMD-), dispatches (BL-) and expenses (DEP-) already have.
-- Existing posted rows are numbered in posting order; the sequences continue
-- from there. Additive.

CREATE SEQUENCE "sale_reference_seq" START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE "purchase_reference_seq" START WITH 1 INCREMENT BY 1;

ALTER TABLE "sales" ADD COLUMN "reference" TEXT;
UPDATE "sales" s
SET "reference" = 'VT-' || lpad(r.n::text, 6, '0')
FROM (
  SELECT "id", row_number() OVER (ORDER BY "posted_at", "id") AS n FROM "sales"
) r
WHERE s."id" = r."id";
SELECT setval(
  'sale_reference_seq',
  GREATEST((SELECT count(*) FROM "sales"), 1),
  (SELECT count(*) FROM "sales") > 0
);
ALTER TABLE "sales" ALTER COLUMN "reference" SET NOT NULL;
CREATE UNIQUE INDEX "sales_reference_key" ON "sales"("reference");

-- A purchase is numbered when it is posted; drafts stay unnumbered.
ALTER TABLE "purchases" ADD COLUMN "reference" TEXT;
UPDATE "purchases" p
SET "reference" = 'AC-' || lpad(r.n::text, 6, '0')
FROM (
  SELECT "id", row_number() OVER (ORDER BY "posted_at", "id") AS n
  FROM "purchases"
  WHERE "posted_at" IS NOT NULL
) r
WHERE p."id" = r."id";
SELECT setval(
  'purchase_reference_seq',
  GREATEST((SELECT count(*) FROM "purchases" WHERE "posted_at" IS NOT NULL), 1),
  (SELECT count(*) FROM "purchases" WHERE "posted_at" IS NOT NULL) > 0
);
CREATE UNIQUE INDEX "purchases_reference_key" ON "purchases"("reference");
