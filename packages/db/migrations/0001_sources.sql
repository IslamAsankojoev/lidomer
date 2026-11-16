CREATE TYPE "public"."deal_status" AS ENUM('in_work', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."sync_run_status" AS ENUM('running', 'success', 'error');--> statement-breakpoint
CREATE TYPE "public"."ward_source_kind" AS ENUM('ad', 'post', 'direct', 'unknown');--> statement-breakpoint
CREATE TABLE "b24_deals" (
	"workspace_id" uuid NOT NULL,
	"id" text NOT NULL,
	"title" text,
	"category_id" integer,
	"stage_id" text,
	"amount_minor" bigint,
	"currency" text,
	"source_id" text,
	"source_description" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"utm_term" text,
	"assigned_by_id" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "b24_deals_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "b24_deals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "b24_stages" (
	"workspace_id" uuid NOT NULL,
	"stage_id" text NOT NULL,
	"category_id" integer NOT NULL,
	"name" text NOT NULL,
	"semantics" text,
	"sort" integer,
	"mapped_status" "deal_status",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "b24_stages_workspace_id_stage_id_pk" PRIMARY KEY("workspace_id","stage_id")
);
--> statement-breakpoint
ALTER TABLE "b24_stages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meta_ad_accounts" (
	"workspace_id" uuid NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"timezone_name" text NOT NULL,
	"status" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_ad_accounts_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "meta_ad_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meta_ads" (
	"workspace_id" uuid NOT NULL,
	"id" text NOT NULL,
	"account_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"adset_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text,
	"effective_status" text,
	"creative_id" text,
	"preview_path" text,
	"created_time" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_ads_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "meta_ads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meta_adsets" (
	"workspace_id" uuid NOT NULL,
	"id" text NOT NULL,
	"account_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text,
	"optimization_goal" text,
	"destination_type" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_adsets_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "meta_adsets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meta_campaigns" (
	"workspace_id" uuid NOT NULL,
	"id" text NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"objective" text,
	"status" text,
	"effective_status" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_campaigns_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "meta_campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meta_insights_daily" (
	"workspace_id" uuid NOT NULL,
	"ad_id" text NOT NULL,
	"day" date NOT NULL,
	"account_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"adset_id" text NOT NULL,
	"currency" text NOT NULL,
	"spend_minor" bigint NOT NULL,
	"impressions" bigint NOT NULL,
	"clicks" bigint NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_insights_daily_workspace_id_ad_id_day_pk" PRIMARY KEY("workspace_id","ad_id","day")
);
--> statement-breakpoint
ALTER TABLE "meta_insights_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "raw_payloads" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"sync_run_id" bigint,
	"source" "integration_type" NOT NULL,
	"endpoint" text NOT NULL,
	"request" jsonb NOT NULL,
	"http_status" integer NOT NULL,
	"response" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "raw_payloads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"source" "integration_type" NOT NULL,
	"job" text NOT NULL,
	"period_from" date,
	"period_to" date,
	"status" "sync_run_status" DEFAULT 'running' NOT NULL,
	"records" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sync_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ward_conversations" (
	"workspace_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_client_message_at" timestamp with time zone,
	"last_reply_at" timestamp with time zone,
	"channel" text NOT NULL,
	"handled_by" text,
	"needs_manager" text,
	"has_lead" boolean NOT NULL,
	"instagram" text,
	"ad_id" text,
	"post_id" text,
	"messages_in" integer,
	"messages_out" integer,
	"facts" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ward_conversations_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "ward_conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ward_leads" (
	"workspace_id" uuid NOT NULL,
	"id" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone,
	"name" text,
	"phone" text,
	"instagram" text,
	"request" text,
	"source_text" text,
	"status" text,
	"amount" numeric,
	"crm_system" text,
	"crm_entity" text,
	"crm_id" text,
	"ad_id" text,
	"ad_title" text,
	"post_id" text,
	"facts" jsonb,
	"source_kind" "ward_source_kind" NOT NULL,
	"source_ad_id" text,
	"source_post_id" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ward_leads_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "ward_leads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "integrations_workspace_idx";--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "sync_state" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "b24_deals" ADD CONSTRAINT "b24_deals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "b24_stages" ADD CONSTRAINT "b24_stages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ad_accounts" ADD CONSTRAINT "meta_ad_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_ads" ADD CONSTRAINT "meta_ads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_adsets" ADD CONSTRAINT "meta_adsets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_campaigns" ADD CONSTRAINT "meta_campaigns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_insights_daily" ADD CONSTRAINT "meta_insights_daily_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_payloads" ADD CONSTRAINT "raw_payloads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_payloads" ADD CONSTRAINT "raw_payloads_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_payloads" ADD CONSTRAINT "raw_payloads_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ward_conversations" ADD CONSTRAINT "ward_conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ward_leads" ADD CONSTRAINT "ward_leads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "b24_deals_updated_idx" ON "b24_deals" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "meta_insights_daily_day_idx" ON "meta_insights_daily" USING btree ("workspace_id","day");--> statement-breakpoint
CREATE INDEX "raw_payloads_run_idx" ON "raw_payloads" USING btree ("sync_run_id");--> statement-breakpoint
CREATE INDEX "sync_runs_integration_started_idx" ON "sync_runs" USING btree ("integration_id","started_at");--> statement-breakpoint
CREATE INDEX "ward_conversations_created_idx" ON "ward_conversations" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ward_leads_created_idx" ON "ward_leads" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ward_leads_crm_idx" ON "ward_leads" USING btree ("workspace_id","crm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_workspace_type_uq" ON "integrations" USING btree ("workspace_id","type");