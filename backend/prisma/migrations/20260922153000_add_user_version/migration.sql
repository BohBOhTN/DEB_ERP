-- Sprint 17 (BE-38): users get an optimistic-concurrency version like every
-- other editable record so two administrators cannot overwrite each other.
ALTER TABLE "users" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
