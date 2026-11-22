-- Расписание фоновой работы: Supabase Cron раз в минуту вызывает POST /jobs/tick в api.
-- Время отчётов и окна синхронизации считает api; здесь только частота вызова (cron — в UTC).
--
-- Как применить (один раз на проект Supabase, в SQL Editor):
--   1. Заменить <API_URL> на адрес api, например https://lidomer-icm7.vercel.app
--   2. Заменить <CRON_SECRET> на значение CRON_SECRET из переменных окружения api.
--   Секрет хранится в Supabase Vault, а не в тексте задачи.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<CRON_SECRET>', 'lidomer_cron_secret')
where not exists (select 1 from vault.secrets where name = 'lidomer_cron_secret');

select cron.unschedule('lidomer-tick') where exists (select 1 from cron.job where jobname = 'lidomer-tick');

select cron.schedule(
  'lidomer-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := '<API_URL>/jobs/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'lidomer_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Старые строки cron.job_run_details (старше 7 дней) удаляет api раз в сутки — решение 0012.
--
-- Проверка: последние вызовы и их ответы
-- select jobid, status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- select id, status_code, content::text, created from net._http_response order by created desc limit 5;
