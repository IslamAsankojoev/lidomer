CREATE TYPE "public"."lead_channel" AS ENUM('ad', 'organic', 'direct_unknown', 'other');--> statement-breakpoint
CREATE TABLE "b24_contacts" (
	"workspace_id" uuid NOT NULL,
	"id" text NOT NULL,
	"name" text,
	"phone" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "b24_contacts_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "b24_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"currency" text NOT NULL,
	"day" date NOT NULL,
	"rate" numeric(14, 6) NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rates_currency_day_pk" PRIMARY KEY("currency","day")
);
--> statement-breakpoint
ALTER TABLE "fx_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lead_overrides" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lead_id" text NOT NULL,
	"field" text NOT NULL,
	"value" jsonb NOT NULL,
	"reason" text NOT NULL,
	"author_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "leads" (
	"workspace_id" uuid NOT NULL,
	"id" text NOT NULL,
	"origin" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"day" date NOT NULL,
	"name" text,
	"phone" text,
	"instagram" text,
	"channel" "lead_channel" NOT NULL,
	"ad_key" text,
	"ad_id" text,
	"ad_name" text,
	"campaign_name" text,
	"adset_name" text,
	"post_id" text,
	"ward_lead_id" integer,
	"deal_id" text,
	"deal_source_id" text,
	"status" "deal_status" NOT NULL,
	"amount_minor" bigint,
	"currency" text,
	"is_repeat" boolean DEFAULT false NOT NULL,
	"repeat_of" text,
	"flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"overrides" jsonb,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "metrics_daily" (
	"workspace_id" uuid NOT NULL,
	"day" date NOT NULL,
	"channel" "lead_channel" NOT NULL,
	"ad_key" text DEFAULT '' NOT NULL,
	"leads" integer DEFAULT 0 NOT NULL,
	"repeats" integer DEFAULT 0 NOT NULL,
	"with_phone" integer DEFAULT 0 NOT NULL,
	"sales" integer DEFAULT 0 NOT NULL,
	"sales_amount_minor" bigint DEFAULT 0 NOT NULL,
	"spend_minor" bigint,
	"spend_currency" text,
	"meta_leads" integer,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metrics_daily_workspace_id_day_channel_ad_key_pk" PRIMARY KEY("workspace_id","day","channel","ad_key")
);
--> statement-breakpoint
ALTER TABLE "metrics_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "b24_deals" ADD COLUMN "contact_id" text;--> statement-breakpoint
ALTER TABLE "b24_contacts" ADD CONSTRAINT "b24_contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_overrides" ADD CONSTRAINT "lead_overrides_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_daily" ADD CONSTRAINT "metrics_daily_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_overrides_lead_idx" ON "lead_overrides" USING btree ("workspace_id","lead_id");--> statement-breakpoint
CREATE INDEX "leads_day_idx" ON "leads" USING btree ("workspace_id","day");--> statement-breakpoint
CREATE INDEX "leads_ad_idx" ON "leads" USING btree ("workspace_id","ad_key");