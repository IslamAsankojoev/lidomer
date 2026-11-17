import { HttpError } from './http';

export const PREVIEWS_BUCKET = 'previews';
export const LOGOS_BUCKET = 'logos';

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

  /**
   * Подписанные ссылки на несколько файлов одним запросом. Параллельные запросы по одному
   * на каждый файл локально висели по 20–60 с (новые соединения), пакетный — один.
   * Файлы, которые Storage не подписал, в ответе отсутствуют.
   */
  async signedUrls(
    bucket: string,
    paths: string[],
    expiresIn = 3600,
  ): Promise<Map<string, string>> {
    const urls = new Map<string, string>();
    const unique = [...new Set(paths)];
    if (!unique.length) return urls;
    const res = await this.fetchFn(new URL(`/storage/v1/object/sign/${bucket}`, this.supabaseUrl), {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn, paths: unique }),
    });
    const body = (await res.json().catch(() => null)) as
      { path?: string; signedURL?: string | null }[] | null;
    if (!res.ok || !Array.isArray(body))
      throw new HttpError(res.status, `Storage: нет ссылок в ${bucket}`);
    for (const item of body)
      if (item.path && item.signedURL)
        urls.set(item.path, new URL(`/storage/v1${item.signedURL}`, this.supabaseUrl).toString());
    return urls;
  }

  /** Ссылка на файл в публичном бакете (логотипы). */
  publicUrl(bucket: string, path: string): string {
    return new URL(`/storage/v1/object/public/${bucket}/${path}`, this.supabaseUrl).toString();
  }

  async remove(bucket: string, paths: string[]): Promise<void> {
    if (!paths.length) return;
    const res = await this.fetchFn(new URL(`/storage/v1/object/${bucket}`, this.supabaseUrl), {
      method: 'DELETE',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!res.ok) throw new HttpError(res.status, `Storage: не удалось удалить файлы из ${bucket}`);
  }
}
