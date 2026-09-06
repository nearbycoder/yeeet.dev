CREATE TABLE "site_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"site_id" text NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"project" text DEFAULT '' NOT NULL,
	"tags" text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_preferences" ADD CONSTRAINT "site_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_preferences" ADD CONSTRAINT "site_preferences_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "site_preferences_user_site_idx" ON "site_preferences" USING btree ("user_id","site_id");