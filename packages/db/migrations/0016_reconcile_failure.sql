ALTER TABLE "reconcile_state" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reconcile_state" ADD COLUMN "error" text;