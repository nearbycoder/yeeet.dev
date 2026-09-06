CREATE TABLE "site_health" (
	"site_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"path" text DEFAULT '/' NOT NULL,
	"expected_status" integer DEFAULT 200 NOT NULL,
	"next_check_at" timestamp DEFAULT now() NOT NULL,
	"checked_at" timestamp,
	"deployment_id" text,
	"response_status" integer,
	"latency_ms" integer,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "site_health" ADD CONSTRAINT "site_health_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_health" ADD CONSTRAINT "site_health_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_health_due_idx" ON "site_health" USING btree ("enabled","next_check_at");