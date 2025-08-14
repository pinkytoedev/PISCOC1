-- Migration to convert uploadType to uploadTypes jsonb array
-- This allows tokens to support multiple upload types

-- Step 1: Add the new column
ALTER TABLE "upload_tokens" ADD COLUMN "upload_types" jsonb;

-- Step 2: Migrate existing data
UPDATE "upload_tokens" SET "upload_types" = 
  CASE 
    WHEN "upload_type" = 'image' THEN '["image"]'::jsonb
    WHEN "upload_type" = 'instagram-image' THEN '["instagram-image"]'::jsonb
    WHEN "upload_type" = 'html-zip' THEN '["html-zip"]'::jsonb
    ELSE '["image"]'::jsonb
  END;

-- Step 3: Make the new column NOT NULL after migration
ALTER TABLE "upload_tokens" ALTER COLUMN "upload_types" SET NOT NULL;

-- Step 4: Remove the old column
ALTER TABLE "upload_tokens" DROP COLUMN "upload_type";