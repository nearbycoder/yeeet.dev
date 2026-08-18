ALTER TABLE "deployments" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "request_fingerprint" text;--> statement-breakpoint
CREATE UNIQUE INDEX "deployments_user_idempotency_idx" ON "deployments" USING btree ("user_id","idempotency_key");