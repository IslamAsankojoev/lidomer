CREATE TABLE "heartbeats" (
	"key" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone,
	"alerted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "heartbeats" ENABLE ROW LEVEL SECURITY;