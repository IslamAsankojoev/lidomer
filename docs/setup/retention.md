# Очистка служебных таблиц — что сделать владельцу

Очистка идёт сама раз в сутки внутри `tick` (решение 0012). Запускать SQL в Supabase не нужно.

## Перед слиянием PR

Применить миграцию 0014 (два индекса для очистки, данные не меняются):

```
pnpm db:migrate
```

Нужен `DATABASE_URL_DIRECT` в `.env.local`. Проверка — оба индекса на месте:

```sql
select indexname from pg_indexes
where indexname in ('raw_payloads_fetched_idx', 'sync_runs_started_idx');
```

## Проверка после выкладки

Отметка последней очистки (обновляется раз в сутки):

```sql
select at from heartbeats where key = 'retention';
```

Размер и самая старая запись — `raw_payloads` не старше 14 дней (кроме последнего
`crm.status.list` у каждого Bitrix24), `sync_runs` — 30, `cron.job_run_details` — 7:

```sql
select pg_size_pretty(pg_total_relation_size('raw_payloads')) as raw_size,
       (select min(fetched_at) from raw_payloads where endpoint <> 'crm.status.list') as raw_oldest,
       (select min(started_at) from sync_runs) as runs_oldest,
       (select min(end_time) from cron.job_run_details) as cron_oldest;
```

Первые записи станут старше 14 дней 30.11.2026 — с этого дня `raw_size` перестанет расти.
В логах api раз в сутки: «Очистка: raw_payloads N, sync_runs N, cron.job_run_details N».
