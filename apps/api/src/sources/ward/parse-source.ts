import type { WardLead } from './ward.client';

export type WardSourceKind = 'ad' | 'post' | 'direct' | 'unknown';

export interface ParsedWardSource {
  kind: WardSourceKind;
  adId: string | null;
  postId: string | null;
}

const str = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);

/**
 * Откуда пришёл лид. Поле `ad` главное; если его нет — текст `source`:
 * «реклама #id» → объявление, «пост id» / post_id → пост, «Instagram Direct» → Direct.
 * Неразобранный источник — `unknown` (флаг), а не догадка.
 */
export function parseWardSource(
  lead: Pick<WardLead, 'ad' | 'source' | 'post_id'>,
): ParsedWardSource {
  const adId = str(lead.ad?.id);
  const postId = str(lead.post_id);
  if (adId) return { kind: 'ad', adId, postId };

  const text = (lead.source ?? '').toLowerCase();
  const adMatch = /реклам[а-я]*\s*#?\s*(\d{6,})/.exec(text);
  if (adMatch) return { kind: 'ad', adId: adMatch[1]!, postId };

  const postMatch = /пост\s*#?\s*(\d{6,})/.exec(text);
  if (postMatch) return { kind: 'post', adId: null, postId: postMatch[1]! };
  if (postId && /пост|post|коммент/.test(text)) return { kind: 'post', adId: null, postId };

  if (/direct|директ/.test(text)) return { kind: 'direct', adId: null, postId: null };
  if (postId) return { kind: 'post', adId: null, postId };
  return { kind: 'unknown', adId: null, postId: null };
}
