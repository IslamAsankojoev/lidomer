import { greenApiHostSchema, type WhatsappGroup } from '@lidomer/shared';
import { z } from 'zod';
import { HttpError } from '../common/http';
import { type Ipv4Request, type Ipv4Response, requestIpv4 } from '../common/ipv4-request';

const TIMEOUT_MS = 15_000;
const FILE_TIMEOUT_MS = 30_000;

export type GreenApiKeys = {
  apiUrl: string;
  mediaUrl: string;
  idInstance: string;
  apiTokenInstance: string;
};
export type GreenApiTransport = (req: Ipv4Request) => Promise<Ipv4Response>;

/** Состояние номера: authorized — можно слать. */
export type GreenState =
  | 'authorized'
  | 'notAuthorized'
  | 'blocked'
  | 'suspended'
  | 'yellowCard'
  | 'starting'
  | 'sleepMode'
  | (string & {});

const stateSchema = z.looseObject({ stateInstance: z.string() });
const waSettingsSchema = z.looseObject({
  phone: z.string().nullish(),
  stateInstance: z.string().nullish(),
});
const contactsSchema = z.array(
  z.looseObject({
    id: z.string(),
    name: z.string().nullish(),
    contactName: z.string().nullish(),
    type: z.string().nullish(),
  }),
);
const sentSchema = z.looseObject({ idMessage: z.string() });

/** Понятная причина по коду ответа. Тело ответа и адрес (в нём токен) в текст не попадают. */
function reason(status: number): string {
  if (status === 401 || status === 403) return 'неверный токен или инстанс удалён';
  if (status === 466)
    return 'лимит тарифа Green API (Developer — 3 чата), смените тариф на Business';
  if (status === 429) return 'слишком много запросов';
  return `HTTP ${status}`;
}

/**
 * Тонкий клиент Green API: только чтение состояния и групп и отправка файла отчёта.
 * Токен — в пути URL: адрес запроса никуда не пишется, в ошибках — только метод и причина.
 */
export class GreenApiClient {
  private readonly apiUrl: string;
  private readonly mediaUrl: string;

  constructor(
    private readonly keys: GreenApiKeys,
    private readonly transport: GreenApiTransport = requestIpv4,
  ) {
    // Ещё раз здесь: api не ходит по адресу пользователя, если это не Green API.
    this.apiUrl = greenApiHostSchema.parse(keys.apiUrl);
    this.mediaUrl = greenApiHostSchema.parse(keys.mediaUrl);
    if (!/^\d{4,20}$/.test(keys.idInstance)) throw new Error('Green API: неверный idInstance');
  }

  private async call(
    method: string,
    opts: {
      host?: 'api' | 'media';
      http?: 'GET' | 'POST';
      query?: string;
      body?: Buffer;
      contentType?: string;
      timeoutMs?: number;
    } = {},
  ): Promise<unknown> {
    const host = opts.host === 'media' ? this.mediaUrl : this.apiUrl;
    const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
    const url = `${host}/waInstance${this.keys.idInstance}/${method}/${encodeURIComponent(this.keys.apiTokenInstance)}${opts.query ?? ''}`;
    let res: Ipv4Response;
    try {
      res = await this.transport({
        method: opts.http ?? 'GET',
        url,
        body: opts.body,
        contentType: opts.contentType,
        timeoutMs,
      });
    } catch {
      throw new HttpError(504, `Green API ${method}: нет ответа за ${timeoutMs / 1000} с`);
    }
    if (res.status >= 400)
      throw new HttpError(res.status, `Green API ${method}: ${reason(res.status)}`);
    try {
      return JSON.parse(res.text) as unknown;
    } catch {
      throw new HttpError(502, `Green API ${method}: неожиданный ответ`);
    }
  }

  private parse<T>(method: string, schema: z.ZodType<T>, data: unknown): T {
    const r = schema.safeParse(data);
    if (!r.success) throw new HttpError(502, `Green API ${method}: неожиданный ответ`);
    return r.data;
  }

  async getState(): Promise<GreenState> {
    return this.parse('getStateInstance', stateSchema, await this.call('getStateInstance'))
      .stateInstance;
  }

  async getWaSettings(): Promise<{ phone: string | null; state: string | null }> {
    const r = this.parse('getWaSettings', waSettingsSchema, await this.call('getWaSettings'));
    return { phone: r.phone || null, state: r.stateInstance ?? null };
  }

  /** Только группы (`group=true`): телефонная книга номера не запрашивается. */
  async getGroups(): Promise<WhatsappGroup[]> {
    const list = this.parse(
      'getContacts',
      contactsSchema,
      await this.call('getContacts', { query: '?group=true' }),
    );
    return list
      .filter((c) => c.type === 'group' && c.id.endsWith('@g.us'))
      .map((c) => ({ id: c.id, name: c.name || c.contactName || 'Группа без названия' }));
  }

  /** Файл в чат: по расширению fileName WhatsApp решает, фото это или документ. */
  async sendFile(
    chatId: string,
    file: Uint8Array | ArrayBuffer,
    fileName: string,
    caption: string,
  ): Promise<{ idMessage: string }> {
    const form = new FormData();
    form.set('chatId', chatId);
    form.set('fileName', fileName);
    form.set('caption', caption.slice(0, 1024));
    const type = fileName.endsWith('.pdf') ? 'application/pdf' : 'image/png';
    form.set('file', new Blob([new Uint8Array(file)], { type }), fileName);
    const r = new Response(form);
    const body = Buffer.from(await r.arrayBuffer());
    const res = await this.call('sendFileByUpload', {
      host: 'media',
      http: 'POST',
      body,
      contentType: r.headers.get('content-type') ?? 'multipart/form-data',
      timeoutMs: FILE_TIMEOUT_MS,
    });
    return { idMessage: this.parse('sendFileByUpload', sentSchema, res).idMessage };
  }
}
