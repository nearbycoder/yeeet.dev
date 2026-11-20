CREATE INDEX "deployment_feedback_deployment_id_idx" ON "deployment_feedback" USING btree ("deployment_id");--> statement-breakpoint
CREATE INDEX "deployments_user_created_at_idx" ON "deployments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "site_preferences_site_id_idx" ON "site_preferences" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_endpoint_id_idx" ON "webhook_deliveries" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_user_created_at_idx" ON "webhook_deliveries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "device_code_device_code_idx" ON "device_code" USING btree ("device_code");--> statement-breakpoint
CREATE INDEX "device_code_user_code_idx" ON "device_code" USING btree ("user_code");