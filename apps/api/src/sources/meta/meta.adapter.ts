import { metaAdAccounts, metaAds, metaAdsets, metaCampaigns, metaInsightsDaily } from '@lidomer/db';
import { DEFAULT_TIMEZONE, currencyDigits, shiftDay, toDayKey } from '@lidomer/shared';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { HttpError } from '../../common/http';
import { maskSecret } from '../../common/secret-box';
import { PREVIEWS_BUCKET, type Storage } from '../../common/storage';
import { excludedSet } from '../../common/upsert';
import { isDue, type JobSpec, type SourceAdapter } from '../types';
import { exchangeLoginCode, MetaClient, type MetaClientOptions } from './meta.client';

export const metaSecretsSchema = z.object({ accessToken: z.string().min(20) });
export type MetaSecrets = z.infer<typeof metaSecretsSchema>;

const HOUR = 3_600_000;
const s = z.string().nullish();

const accountSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  currency: z.string(),
  timezone_name: z.string(),
  account_status: z.number(),
});
const campaignSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  objective: s,
  status: s,
  effective_status: s,
});
const adsetSchema = z.looseObject({
  id: z.string(),
  campaign_id: z.string(),
  name: z.string(),
  status: s,
  optimization_goal: s,
  destination_type: s,
});
const adSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  campaign_id: z.string(),
  adset_id: z.string(),
  status: s,
  effective_status: s,
  created_time: s,
  creative: z.looseObject({ id: z.string(), thumbnail_url: s, image_url: s }).nullish(),
});
const insightSchema = z.looseObject({
  ad_id: z.string(),
  adset_id: z.string(),
  campaign_id: z.string(),
  date_start: z.string(),
  spend: z.string().nullish(),
  impressions: z.string().nullish(),
  clicks: z.string().nullish(),
  actions: z.array(z.looseObject({ action_type: z.string(), value: z.string() })).nullish(),
});

/** «12.34» в валюте аккаунта → минимальные единицы. */
export function spendToMinor(spend: string | null | undefined, currency: string): number {
  return Math.round(Number(spend ?? 0) * 10 ** currencyDigits(currency));
}

/** Периоды не длиннее 7 дней: длинные запросы Insights медленные и упираются в лимиты. */
export function weekChunks(from: string, to: string): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (let start = from; start <= to; start = shiftDay(start, 7)) {
    const end = shiftDay(start, 6);
    out.push({ from: start, to: end < to ? end : to });
  }
  return out;
}

function insightJobs(now: Date, days: number): JobSpec[] {
  // День в Meta — в поясе рекламного аккаунта; берём окно по UTC с запасом в день.
  const to = toDayKey(now, 'UTC');
  return weekChunks(shiftDay(to, -days), to).map((p) => ({ kind: 'meta:insights', params: p }));
}

export interface MetaAdapterDeps {
  clientOpts?: MetaClientOptions;
  appId?: string;
  appSecret?: string;
  storage?: Storage;
}

export function createMetaAdapter(deps: MetaAdapterDeps = {}): SourceAdapter<MetaSecrets> {
  const client = (secrets: MetaSecrets, onResponse?: MetaClientOptions['onResponse']) =>
    new MetaClient(secrets.accessToken, { ...deps.clientOpts, onResponse });

  const listAccounts = (api: MetaClient) =>
    api.getAll('/me/adaccounts', accountSchema, {
      fields: 'id,name,currency,timezone_name,account_status',
    });

  return {
    type: 'meta_ads',
    secretsSchema: metaSecretsSchema,
    mask: (sec) => ({ accessToken: maskSecret(sec.accessToken) }),

    /** Форма присылает код Facebook Login for Business или (для отладки) готовый токен. */
    async prepareSecrets(input) {
      const parsed = z
        .union([z.object({ code: z.string().min(1) }), metaSecretsSchema])
        .parse(input);
      if ('accessToken' in parsed) return parsed;
      if (!deps.appId || !deps.appSecret)
        throw new Error('Не заданы META_APP_ID и META_APP_SECRET');
      return {
        accessToken: await exchangeLoginCode(
          parsed.code,
          deps.appId,
          deps.appSecret,
          deps.clientOpts?.fetchFn,
        ),
      };
    },

    async test(secrets, recordRaw) {
      const accounts = await listAccounts(client(secrets, recordRaw));
      if (!accounts.length)
        throw new HttpError(403, 'Meta: у токена нет доступа ни к одному рекламному аккаунту');
      const warnings = accounts
        .filter((a) => a.timezone_name !== DEFAULT_TIMEZONE)
        .map(
          (a) =>
            `Часовой пояс аккаунта «${a.name}» — ${a.timezone_name}, а не ${DEFAULT_TIMEZONE}: дни в Meta и в отчёте могут не совпадать`,
        );
      return {
        details: Object.fromEntries(
          accounts.map((a) => [a.name, `${a.id} · ${a.currency} · ${a.timezone_name}`]),
        ),
        warnings,
      };
    },

    // При подключении — структура и история за 90 дней.
    initialJobs: (now) => [{ kind: 'meta:structure', params: {} }, ...insightJobs(now, 90)],

    // Каждые 3 часа — последние 7 дней; раз в сутки — структура и 28 дней.
    dueJobs(state, now) {
      const next = { ...state };
      if (isDue(state, 'meta:daily', now, 24 * HOUR)) {
        next['meta:daily'] = next['meta:recent'] = now.toISOString();
        return {
          jobs: [{ kind: 'meta:structure', params: {} }, ...insightJobs(now, 28)],
          state: next,
        };
      }
      if (isDue(state, 'meta:recent', now, 3 * HOUR)) {
        next['meta:recent'] = now.toISOString();
        return { jobs: insightJobs(now, 7), state: next };
      }
      return { jobs: [], state: next };
    },

    async run(job, secrets, ctx) {
      const api = client(secrets, ctx.recordRaw);

      if (job.kind === 'meta:structure') {
        const accounts = await listAccounts(api);
        let records = 0;
        if (accounts.length) {
          await ctx.db
            .insert(metaAdAccounts)
            .values(
              accounts.map((a) => ({
                workspaceId: ctx.workspaceId,
                id: a.id,
                name: a.name,
                currency: a.currency,
                timezoneName: a.timezone_name,
                status: a.account_status,
              })),
            )
            // Выбор аккаунтов владельцем (enabled) не трогаем.
            .onConflictDoUpdate({
              target: [metaAdAccounts.workspaceId, metaAdAccounts.id],
              set: excludedSet(metaAdAccounts, ['workspaceId', 'id', 'enabled']),
            });
        }
        const enabled = await ctx.db
          .select({ id: metaAdAccounts.id })
          .from(metaAdAccounts)
          .where(
            and(eq(metaAdAccounts.workspaceId, ctx.workspaceId), eq(metaAdAccounts.enabled, true)),
          );

        for (const { id: accountId } of enabled) {
          const campaigns = await api.getAll(`/${accountId}/campaigns`, campaignSchema, {
            fields: 'id,name,objective,status,effective_status',
          });
          const adsets = await api.getAll(`/${accountId}/adsets`, adsetSchema, {
            fields: 'id,campaign_id,name,status,optimization_goal,destination_type',
          });
          const ads = await api.getAll(`/${accountId}/ads`, adSchema, {
            // Миниатюра 600×600: по умолчанию Meta отдаёт 64×64, в галерее она размыта.
            fields:
              'id,name,campaign_id,adset_id,status,effective_status,created_time,creative.thumbnail_width(600).thumbnail_height(600){id,thumbnail_url,image_url}',
          });
          if (campaigns.length)
            await ctx.db
              .insert(metaCampaigns)
              .values(
                campaigns.map((c) => ({
                  workspaceId: ctx.workspaceId,
                  id: c.id,
                  accountId,
                  name: c.name,
                  objective: c.objective ?? null,
                  status: c.status ?? null,
                  effectiveStatus: c.effective_status ?? null,
                })),
              )
              .onConflictDoUpdate({
                target: [metaCampaigns.workspaceId, metaCampaigns.id],
                set: excludedSet(metaCampaigns, ['workspaceId', 'id']),
              });
          if (adsets.length)
            await ctx.db
              .insert(metaAdsets)
              .values(
                adsets.map((a) => ({
                  workspaceId: ctx.workspaceId,
                  id: a.id,
                  accountId,
                  campaignId: a.campaign_id,
                  name: a.name,
                  status: a.status ?? null,
                  optimizationGoal: a.optimization_goal ?? null,
                  destinationType: a.destination_type ?? null,
                })),
              )
              .onConflictDoUpdate({
                target: [metaAdsets.workspaceId, metaAdsets.id],
                set: excludedSet(metaAdsets, ['workspaceId', 'id']),
              });
          for (const ad of ads) {
            const previewPath = await copyPreview(ctx.workspaceId, ad, deps);
            await ctx.db
              .insert(metaAds)
              .values({
                workspaceId: ctx.workspaceId,
                id: ad.id,
                accountId,
                campaignId: ad.campaign_id,
                adsetId: ad.adset_id,
                name: ad.name,
                status: ad.status ?? null,
                effectiveStatus: ad.effective_status ?? null,
                creativeId: ad.creative?.id ?? null,
                previewPath,
                createdTime: ad.created_time ? new Date(ad.created_time) : null,
              })
              .onConflictDoUpdate({
                target: [metaAds.workspaceId, metaAds.id],
                // Если превью скопировать не удалось — старую копию не затираем.
                set: excludedSet(metaAds, [
                  'workspaceId',
                  'id',
                  ...(previewPath ? [] : ['previewPath']),
                ]),
              });
          }
          records += campaigns.length + adsets.length + ads.length;
        }
        return { records };
      }

      if (job.kind === 'meta:insights') {
        const { from, to } = z.object({ from: z.string(), to: z.string() }).parse(job.params);
        const accounts = await ctx.db
          .select()
          .from(metaAdAccounts)
          .where(
            and(eq(metaAdAccounts.workspaceId, ctx.workspaceId), eq(metaAdAccounts.enabled, true)),
          );
        let records = 0;
        for (const acc of accounts) {
          const rows = await api.getAll(`/${acc.id}/insights`, insightSchema, {
            level: 'ad',
            time_increment: '1',
            time_range: JSON.stringify({ since: from, until: to }),
            fields: 'ad_id,adset_id,campaign_id,spend,impressions,clicks,actions',
          });
          if (!rows.length) continue;
          await ctx.db
            .insert(metaInsightsDaily)
            .values(
              rows.map((r) => ({
                workspaceId: ctx.workspaceId,
                adId: r.ad_id,
                day: r.date_start,
                accountId: acc.id,
                campaignId: r.campaign_id,
                adsetId: r.adset_id,
                currency: acc.currency,
                spendMinor: spendToMinor(r.spend, acc.currency),
                impressions: Number(r.impressions ?? 0),
                clicks: Number(r.clicks ?? 0),
                actions: r.actions ?? [],
              })),
            )
            .onConflictDoUpdate({
              target: [
                metaInsightsDaily.workspaceId,
                metaInsightsDaily.adId,
                metaInsightsDaily.day,
              ],
              set: excludedSet(metaInsightsDaily, ['workspaceId', 'adId', 'day']),
            });
          records += rows.length;
        }
        return { records };
      }

      throw new Error(`Meta: неизвестная задача ${job.kind}`);
    },
  };
}

/** Копия превью в Storage: ссылки Meta временные. Ошибка копирования не роняет синхронизацию. */
async function copyPreview(
  workspaceId: string,
  ad: z.infer<typeof adSchema>,
  deps: MetaAdapterDeps,
): Promise<string | null> {
  const src = ad.creative?.thumbnail_url ?? ad.creative?.image_url;
  if (!src || !deps.storage) return null;
  try {
    const fetchFn = deps.clientOpts?.fetchFn ?? fetch;
    const res = await fetchFn(src);
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? 'image/jpeg';
    const ext = type.includes('png') ? 'png' : 'jpg';
    const path = `${workspaceId}/${ad.id}.${ext}`;
    await deps.storage.upload(PREVIEWS_BUCKET, path, await res.arrayBuffer(), type);
    return path;
  } catch {
    return null;
  }
}
