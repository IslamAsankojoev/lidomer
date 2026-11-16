import { HttpError } from './http';

export const PREVIEWS_BUCKET = 'previews';

/** Узкий клиент Supabase Storage: загрузка файла в закрытый бакет и подписанная ссылка. */
export class Storage {
  constructor(
    private readonly supabaseUrl: string,
    private readonly serviceKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { apikey: this.serviceKey, ...extra };
    if (this.serviceKey.startsWith('eyJ')) h.Authorization = `Bearer ${this.serviceKey}`;
    return h;
  }

  async upload(
    bucket: string,
    path: string,
    data: ArrayBuffer,
    contentType: string,
  ): Promise<void> {
    const res = await this.fetchFn(
      new URL(`/storage/v1/object/${bucket}/${path}`, this.supabaseUrl),
      {
        method: 'POST',
        headers: this.headers({ 'Content-Type': contentType, 'x-upsert': 'true' }),
        body: data,
      },
    );
    if (!res.ok) throw new HttpError(res.status, `Storage: не удалось сохранить ${path}`);
  }

  async signedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string> {
    const res = await this.fetchFn(
      new URL(`/storage/v1/object/sign/${bucket}/${path}`, this.supabaseUrl),
      {
        method: 'POST',
        headers: this.headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ expiresIn }),
      },
    );
    const body = (await res.json().catch(() => null)) as { signedURL?: string } | null;
    if (!res.ok || !body?.signedURL)
      throw new HttpError(res.status, `Storage: нет ссылки на ${path}`);
    return new URL(`/storage/v1${body.signedURL}`, this.supabaseUrl).toString();
  }
}
