CREATE TABLE "reconcile_state" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"seen_at" timestamp with time zone NOT NULL,
	"full_at" timestamp with time zone NOT NULL,
	"meta_connected" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reconcile_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reconcile_state" ADD CONSTRAINT "reconcile_state_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "b24_contacts_synced_idx" ON "b24_contacts" USING btree ("workspace_id","synced_at");--> statement-breakpoint
CREATE INDEX "b24_deals_synced_idx" ON "b24_deals" USING btree ("workspace_id","synced_at");--> statement-breakpoint
CREATE INDEX "meta_insights_daily_synced_idx" ON "meta_insights_daily" USING btree ("workspace_id","synced_at");--> statement-breakpoint
CREATE INDEX "ward_leads_synced_idx" ON "ward_leads" USING btree ("workspace_id","synced_at");