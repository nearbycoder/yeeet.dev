ALTER TABLE "deployments" ADD COLUMN "release_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "release_notes" text DEFAULT '' NOT NULL;