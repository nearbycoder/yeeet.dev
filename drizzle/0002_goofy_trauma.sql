CREATE TABLE "custom_domains" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"user_id" text NOT NULL,
	"hostname" text NOT NULL,
	"railway_domain_id" text NOT NULL,
	"verification_token" text,
	"verification_host" text,
	"dns_records" text DEFAULT '[]' NOT NULL,
	"certificate_status" text DEFAULT 'PENDING' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "spa_fallback" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_domains" ADD CONSTRAINT "custom_domains_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_domains" ADD CONSTRAINT "custom_domains_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_domains_hostname_idx" ON "custom_domains" USING btree ("hostname");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_domains_railway_id_idx" ON "custom_domains" USING btree ("railway_domain_id");--> statement-breakpoint
CREATE INDEX "custom_domains_site_id_idx" ON "custom_domains" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "custom_domains_user_id_idx" ON "custom_domains" USING btree ("user_id");