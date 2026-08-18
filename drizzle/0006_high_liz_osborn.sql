CREATE TABLE "site_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"hostname_label" text NOT NULL,
	"deployment_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "site_channels" ADD CONSTRAINT "site_channels_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_channels" ADD CONSTRAINT "site_channels_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_channels" ADD CONSTRAINT "site_channels_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "site_channels_site_name_idx" ON "site_channels" USING btree ("site_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "site_channels_hostname_idx" ON "site_channels" USING btree ("hostname_label");--> statement-breakpoint
CREATE INDEX "site_channels_user_id_idx" ON "site_channels" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "site_channels_deployment_id_idx" ON "site_channels" USING btree ("deployment_id");