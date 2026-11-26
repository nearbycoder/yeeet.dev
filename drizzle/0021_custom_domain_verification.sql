ALTER TABLE "custom_domains" ALTER COLUMN "railway_domain_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_domains" ADD COLUMN "dns_verified_at" timestamp;
--> statement-breakpoint
UPDATE "custom_domains"
SET
  "verification_token" = 'yeeet-verify=' || gen_random_uuid(),
  "verification_host" = '_yeeet-verify.' || "hostname",
  "dns_records" = '[]',
  "certificate_status" = 'PENDING',
  "error" = NULL
WHERE "railway_domain_id" IS NOT NULL;
