ALTER TABLE "deployments" ADD COLUMN "header_rules" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "redirect_rules" text DEFAULT '[]' NOT NULL;