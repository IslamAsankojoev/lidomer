ALTER TABLE "report_runs" ADD COLUMN "pdf_path" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "updated_by" uuid;