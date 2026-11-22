CREATE INDEX "raw_payloads_fetched_idx" ON "raw_payloads" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "sync_runs_started_idx" ON "sync_runs" USING btree ("started_at");