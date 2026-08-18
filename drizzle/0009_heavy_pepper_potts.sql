CREATE TABLE "site_analytics_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"path" text NOT NULL,
	"status" integer NOT NULL,
	"views" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_analytics_daily" ADD CONSTRAINT "site_analytics_daily_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_analytics_daily" ADD CONSTRAINT "site_analytics_daily_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "site_analytics_daily_bucket_idx" ON "site_analytics_daily" USING btree ("site_id","date","path","status");--> statement-breakpoint
CREATE INDEX "site_analytics_daily_site_date_idx" ON "site_analytics_daily" USING btree ("site_id","date");--> statement-breakpoint
CREATE INDEX "site_analytics_daily_user_id_idx" ON "site_analytics_daily" USING btree ("user_id");