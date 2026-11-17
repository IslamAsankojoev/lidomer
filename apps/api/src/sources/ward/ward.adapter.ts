import { wardConversations, wardLeads } from '@lidomer/db';
import { shiftDay, toDayKey } from '@lidomer/shared';
import { z } from 'zod';
import { maskSecret } from '../../common/secret-box';
import { excludedSet } from '../../common/upsert';
import { isDue, type JobSpec, type SourceAdapter } from '../types';
import { parseWardSource } from './parse-source';
import {
  WardClient,
  wardConversationSchema,
  wardLeadSchema,
  type WardClientOptions,
} from './ward.client';

export const wardSecretsSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .regex(/^wdr_\S{8,}$/, 'Ключ WARD начинается с wdr_'),
});
export type WardSecrets = z.infer<typeof wardSecretsSchema>;

const MINUTE = 60_000;
const str = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
const dayJobs = (days: string[]): JobSpec[] =>
  days.map((day) => ({ kind: 'ward:day', params: { day } }));

/** Дни UTC от `today - back` до `today`. Ward принимает даты в UTC. */
function utcDays(now: Date, back: number): string[] {
  const today = toDayKey(now, 'UTC');
  return Array.from({ length: back + 1 }, (_, i) => shiftDay(today, -i));
}

export function createWardAdapter(clientOpts: WardClientOptions = {}): SourceAdapter<WardSecrets> {
  const client = (secrets: WardSecrets, onResponse?: WardClientOptions['onResponse']) =>
    new WardClient(secrets.apiKey, { ...clientOpts, onResponse });

  return {
    type: 'ward',
    secretsSchema: wardSecretsSchema,
    mask: (s) => ({ apiKey: maskSecret(s.apiKey) }),

    async test(secrets, recordRaw) {
      const now = new Date();
      const summary = await client(secrets, recordRaw).summary(
        shiftDay(toDayKey(now, 'UTC'), -29),
        toDayKey(now, 'UTC'),
      );
      return { details: { 'Лидов за 30 дней': String(summary.leads.total) }, warnings: [] };
    },

    // История за 30 дней при подключении.
    initialJobs: (now) => dayJobs(utcDays(now, 30)),

    // Каждые 15 минут — последние 2 дня; раз в сутки — 30 дней: статусы лидов меняются задним числом.
    dueJobs(state, now) {
      const jobs: JobSpec[] = [];
      const next = { ...state };
      if (isDue(state, 'ward:nightly', now, 24 * 60 * MINUTE)) {
        jobs.push(...dayJobs(utcDays(now, 30)));
        next['ward:nightly'] = next['ward:recent'] = now.toISOString();
      } else if (isDue(state, 'ward:recent', now, 15 * MINUTE)) {
        jobs.push(...dayJobs(utcDays(now, 2)));
        next['ward:recent'] = now.toISOString();
      }
      return { jobs, state: next };
    },

    async run(job, secrets, ctx) {
      if (job.kind !== 'ward:day') throw new Error(`WARD: неизвестная задача ${job.kind}`);
      const day = z.string().parse(job.params.day);
      const api = client(secrets, ctx.recordRaw);

      const leads = await api.listAll('/leads', wardLeadSchema, day, day);
      if (leads.length) {
        await ctx.db
          .insert(wardLeads)
          .values(
            leads.map((l) => {
              const src = parseWardSource(l);
              return {
                workspaceId: ctx.workspaceId,
                id: l.id,
                createdAt: new Date(l.created_at),
                updatedAt: l.updated_at ? new Date(l.updated_at) : null,
                name: str(l.name),
                phone: str(l.phone),
                instagram: str(l.instagram),
                request: str(l.request),
                sourceText: str(l.source),
                status: str(l.status),
                amount: l.amount === null || l.amount === undefined ? null : String(l.amount),
                crmSystem: str(l.crm?.system),
                crmEntity: str(l.crm?.entity),
                crmId: str(l.crm?.id),
                adId: str(l.ad?.id),
                adTitle: str(l.ad?.title),
                postId: str(l.post_id),
                facts: l.facts ?? null,
                sourceKind: src.kind,
                sourceAdId: src.adId,
                sourcePostId: src.postId,
              };
            }),
          )
          .onConflictDoUpdate({
            target: [wardLeads.workspaceId, wardLeads.id],
            set: excludedSet(wardLeads, ['workspaceId', 'id']),
          });
      }

      const convs = await api.listAll('/conversations', wardConversationSchema, day, day);
      if (convs.length) {
        await ctx.db
          .insert(wardConversations)
          .values(
            convs.map((c) => ({
              workspaceId: ctx.workspaceId,
              id: c.id,
              createdAt: new Date(c.created_at),
              lastClientMessageAt: c.last_client_message_at
                ? new Date(c.last_client_message_at)
                : null,
              lastReplyAt: c.last_reply_at ? new Date(c.last_reply_at) : null,
              channel: c.source,
              handledBy: str(c.handled_by),
              needsManager: str(c.needs_manager),
              hasLead: c.has_lead,
              instagram: str(c.instagram),
              adId: typeof c.ad === 'object' && c.ad ? str(c.ad.id) : str(c.ad),
              postId: str(c.post_id),
              messagesIn: c.messages_in ?? null,
              messagesOut: c.messages_out ?? null,
              facts: c.facts ?? null,
            })),
          )
          .onConflictDoUpdate({
            target: [wardConversations.workspaceId, wardConversations.id],
            set: excludedSet(wardConversations, ['workspaceId', 'id']),
          });
      }
      return { records: leads.length + convs.length };
    },
  };
}
