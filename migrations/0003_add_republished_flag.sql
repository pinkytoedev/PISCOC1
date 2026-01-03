-- Track Airtable "Republished" checkbox locally so drafts aren't marked published
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "republished" boolean DEFAULT false;
-- Normalize existing rows
UPDATE "articles" SET "republished" = false WHERE "republished" IS NULL;


