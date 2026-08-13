ALTER TABLE "deployments" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "share_nonce" text DEFAULT '' NOT NULL;