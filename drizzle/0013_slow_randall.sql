CREATE TABLE "site_retention" (
	"site_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"keep_count" integer DEFAULT 10 NOT NULL,
	"min_age_days" integer DEFAULT 30 NOT NULL,
	"next_run_at" timestamp DEFAULT now() NOT NULL,
	"last_run_at" timestamp,
	"last_deleted_count" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "storage_cleanup_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"site_id" text NOT NULL,
	"prefix" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_retention" ADD CONSTRAINT "site_retention_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_retention" ADD CONSTRAINT "site_retention_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_retention_due_idx" ON "site_retention" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE INDEX "storage_cleanup_due_idx" ON "storage_cleanup_jobs" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE INDEX "storage_cleanup_site_idx" ON "storage_cleanup_jobs" USING btree ("site_id");