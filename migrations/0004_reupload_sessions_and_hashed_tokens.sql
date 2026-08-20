-- Re-upload sessions and hashed upload tokens.
--
-- Idempotent throughout: this project applies migrations by hand and the
-- earlier files are not all recorded in the drizzle journal, so a statement may
-- be replayed against a database that already has the change.

-- ---------------------------------------------------------------------------
-- Articles: re-upload session state
-- ---------------------------------------------------------------------------

-- Set while an article is reopened for new content. The auto-publisher skips
-- these rows so a half-updated article is never pushed live.
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "is_reuploading" boolean DEFAULT false;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "reupload_started_at" timestamp;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "reupload_started_by" integer;
ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "reupload_previous_status" text;

-- Backfill so the column is never null; the scheduler treats null as unknown.
UPDATE "articles" SET "is_reuploading" = false WHERE "is_reuploading" IS NULL;

DO $$
BEGIN
  ALTER TABLE "articles"
    ADD CONSTRAINT "articles_reupload_started_by_users_id_fk"
    FOREIGN KEY ("reupload_started_by") REFERENCES "users"("id")
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Finding open sessions is a routine query; keep it off a sequential scan.
CREATE INDEX IF NOT EXISTS "articles_is_reuploading_idx"
  ON "articles" ("is_reuploading")
  WHERE "is_reuploading" = true;

-- ---------------------------------------------------------------------------
-- Upload tokens: store a hash instead of the secret
-- ---------------------------------------------------------------------------

-- Tokens were stored in plaintext, so anyone who could read the table could use
-- every outstanding upload link. Only the SHA-256 is kept now.
ALTER TABLE "upload_tokens" ADD COLUMN IF NOT EXISTS "token_hash" varchar(64);

-- Existing plaintext tokens cannot be converted (the hash of a live secret
-- would still authorize it, defeating the change) so they are retired. Any link
-- already sent out stops working and must be reissued — deliberate, and the
-- reason this is called out in the deploy notes.
DELETE FROM "upload_tokens" WHERE "token_hash" IS NULL;

ALTER TABLE "upload_tokens" ALTER COLUMN "token_hash" SET NOT NULL;

DROP INDEX IF EXISTS "token_idx";
ALTER TABLE "upload_tokens" DROP COLUMN IF EXISTS "token";

CREATE UNIQUE INDEX IF NOT EXISTS "upload_tokens_token_hash_idx"
  ON "upload_tokens" ("token_hash");

-- A contributor link now covers a whole submission rather than a single file,
-- so the default is unlimited uses within the expiry window.
ALTER TABLE "upload_tokens" ALTER COLUMN "max_uses" SET DEFAULT 0;
