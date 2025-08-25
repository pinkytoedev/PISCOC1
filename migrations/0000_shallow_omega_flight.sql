CREATE TABLE "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"timestamp" timestamp DEFAULT now(),
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "admin_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"urgency" text NOT NULL,
	"status" varchar(50) DEFAULT 'open' NOT NULL,
	"created_by" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"assigned_to" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"excerpt" text,
	"content" text,
	"content_format" text DEFAULT 'plaintext' NOT NULL,
	"image_url" text NOT NULL,
	"image_type" text DEFAULT 'url' NOT NULL,
	"image_path" text,
	"instagram_image_url" text,
	"featured" text DEFAULT 'no' NOT NULL,
	"published_at" timestamp,
	"date" text,
	"scheduled" text,
	"finished" boolean DEFAULT false,
	"author" text NOT NULL,
	"photo" text,
	"photo_credit" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"hashtags" text,
	"external_id" text,
	"source" text DEFAULT 'manual'
);
--> statement-breakpoint
CREATE TABLE "carousel_quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"carousel" text NOT NULL,
	"quote" text NOT NULL,
	"main" text,
	"philo" text,
	"external_id" text
);
--> statement-breakpoint
CREATE TABLE "image_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"original_filename" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"hash" text NOT NULL,
	"is_default" boolean DEFAULT false,
	"category" text DEFAULT 'general',
	"created_at" timestamp DEFAULT now(),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "integration_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"service" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"enabled" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"bio" text NOT NULL,
	"image_url" text NOT NULL,
	"image_type" text DEFAULT 'url' NOT NULL,
	"image_path" text,
	"external_id" text
);
--> statement-breakpoint
CREATE TABLE "upload_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar(64) NOT NULL,
	"article_id" integer NOT NULL,
	"upload_type" varchar(50) NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	"max_uses" integer DEFAULT 1,
	"uses" integer DEFAULT 0,
	"active" boolean DEFAULT true,
	"name" varchar(255),
	"notes" text,
	CONSTRAINT "upload_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"last_login" timestamp,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "admin_requests" ADD CONSTRAINT "admin_requests_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_tokens" ADD CONSTRAINT "upload_tokens_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_tokens" ADD CONSTRAINT "upload_tokens_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "token_idx" ON "upload_tokens" USING btree ("token");
