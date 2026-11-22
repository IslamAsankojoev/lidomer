CREATE TYPE "public"."delivery_channel" AS ENUM('telegram', 'green_api');--> statement-breakpoint
ALTER TYPE "public"."integration_type" ADD VALUE 'green_api';--> statement-breakpoint
ALTER TABLE "report_recipients" DROP CONSTRAINT "report_recipients_chat_id_telegram_chats_id_fk";
--> statement-breakpoint
DROP INDEX "report_recipients_uq";--> statement-breakpoint
ALTER TABLE "report_recipients" ADD COLUMN "channel" "delivery_channel" DEFAULT 'telegram' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "report_recipients_uq" ON "report_recipients" USING btree ("report_id","channel","chat_id","thread_id");