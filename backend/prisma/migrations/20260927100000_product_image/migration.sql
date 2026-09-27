-- Issue #64: one photo per product. The row keeps the stored file's name
-- (random, produced by the server) and when it changed; the bytes live under
-- MEDIA_ROOT, outside the database. Additive.
ALTER TABLE "products" ADD COLUMN "image_key" TEXT;
ALTER TABLE "products" ADD COLUMN "image_updated_at" TIMESTAMP(3);
