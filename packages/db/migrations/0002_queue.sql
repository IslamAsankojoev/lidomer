-- Очередь фоновых задач на Supabase Queues (pgmq). Расширения pg_cron и pg_net включаются в supabase/cron.sql.
CREATE EXTENSION IF NOT EXISTS pgmq;--> statement-breakpoint
SELECT pgmq.create('sync') WHERE NOT EXISTS (SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'sync');
