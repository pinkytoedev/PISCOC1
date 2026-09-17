-- Migration to convert uploadType to uploadTypes jsonb array
-- This allows tokens to support multiple upload types
--
-- Idempotent throughout, matching 0003 and 0004: this project applies
-- migrations by hand and they are not recorded in the drizzle journal (which
-- still lists only 0000), so a statement may be replayed against a database
-- that already has the change, and a file may be skipped entirely while later
-- ones are applied.
--
-- Caveat: 0002, 0003 and 0004 are individually safe to replay, but the
-- directory as a whole is NOT. 0000 is drizzle-generated with bare CREATE
-- TABLEs, and 0001 ends in an unguarded ALTER TABLE ... ADD CONSTRAINT
-- session_pkey. Both fail on a second run.
--
-- This file is ordered before 0004 and does not depend on it for its DDL: it
-- touches only upload_type/upload_types, while 0004 touches token/token_hash.
-- The final table shape is the same either way. The order does affect data,
-- though: 0004 deletes rows that 0002 would otherwise have had to backfill
-- before its SET NOT NULL.

-- Step 1: Add the new column
ALTER TABLE "upload_tokens" ADD COLUMN IF NOT EXISTS "upload_types" jsonb;

-- Step 2: Migrate existing data.
--
-- Guarded on the old column still existing, so a replay after step 4 is a
-- no-op rather than an "column upload_type does not exist" error. Rows that
-- already carry a value are left alone.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'upload_tokens' AND column_name = 'upload_type'
  ) THEN
    EXECUTE $sql$
      UPDATE "upload_tokens" SET "upload_types" =
        CASE
          WHEN "upload_type" = 'image' THEN '["image"]'::jsonb
          WHEN "upload_type" = 'instagram-image' THEN '["instagram-image"]'::jsonb
          WHEN "upload_type" = 'html-zip' THEN '["html-zip"]'::jsonb
          ELSE '["image"]'::jsonb
        END
      WHERE "upload_types" IS NULL
    $sql$;
  END IF;
END $$;

-- Any row that reached here without an old column to convert (there should be
-- none) would block the NOT NULL below; give it the same default the CASE does.
UPDATE "upload_tokens" SET "upload_types" = '["image"]'::jsonb WHERE "upload_types" IS NULL;

-- Step 3: Make the new column NOT NULL after migration
ALTER TABLE "upload_tokens" ALTER COLUMN "upload_types" SET NOT NULL;

-- Step 4: Remove the old column.
--
-- It is NOT NULL with no default, so leaving it in place makes every insert
-- drizzle builds fail even once upload_types exists.
ALTER TABLE "upload_tokens" DROP COLUMN IF EXISTS "upload_type";
