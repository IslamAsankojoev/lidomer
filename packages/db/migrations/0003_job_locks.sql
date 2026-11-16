CREATE TABLE "job_locks" (
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"locked_until" timestamp with time zone NOT NULL,
	CONSTRAINT "job_locks_key_pk" PRIMARY KEY("key")
);
--> statement-breakpoint
ALTER TABLE "job_locks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "job_locks" ADD CONSTRAINT "job_locks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;