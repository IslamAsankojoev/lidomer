import type { z } from 'zod';

export class ApiFetchError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiFetchError';
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  baseUrl: string;
  token?: string | null;
  workspaceId?: string | null;
  body?: unknown;
}

/**
 * Типизированный вызов api: ответ проверяется той же zod-схемой, что и на бэкенде.
 * Ответ, не прошедший проверку, — ошибка, а не «как-нибудь отрисуем».
 */
export async function apiFetch<S extends z.ZodType>(
  schema: S,
  path: string,
  { baseUrl, token, workspaceId, body, headers, ...init }: ApiFetchOptions,
): Promise<z.infer<S>> {
  const h = new Headers(headers);
  if (token) h.set('Authorization', `Bearer ${token}`);
  if (workspaceId) h.set('X-Workspace-Id', workspaceId);
  if (body !== undefined) h.set('Content-Type', 'application/json');

  const res = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      json && typeof json === 'object' && 'message' in json && typeof json.message === 'string'
        ? json.message
        : `Ошибка api: ${res.status}`;
    throw new ApiFetchError(res.status, message);
  }
  return schema.parse(json);
}
