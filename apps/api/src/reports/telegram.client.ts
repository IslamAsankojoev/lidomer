import { request } from 'node:https';
import { z } from 'zod';
import { HttpError } from '../common/http';

const TIMEOUT_MS = 15_000;

/**
 * POST в Bot API по IPv4 с таймаутом. Функции Vercel не выходят в IPv6, а api.telegram.org отдаёт
 * AAAA-адрес первым — обычный fetch висел до 120 с. Здесь соединение идёт только по IPv4.
 */
function postIpv4(
  url: string,
  body: Buffer,
  contentType: string,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'POST',
        family: 4,
        timeout: TIMEOUT_MS,
        headers: { 'Content-Type': contentType, 'Content-Length': body.length },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('timeout', () => req.destroy(new Error(`нет ответа за ${TIMEOUT_MS / 1000} с`)));
    req.on('error', reject);
    req.end(body);
  });
}

export type TelegramTransport = (
  url: string,
  body: Buffer,
  contentType: string,
) => Promise<{ status: number; text: string }>;

const okSchema = z.looseObject({
  ok: z.boolean(),
  description: z.string().optional(),
  result: z.unknown().optional(),
});

/** Подпись фото в Telegram — до 1024 символов. */
export const CAPTION_LIMIT = 1024;

/** Тонкий клиент Bot API: только то, что нужно отчётам и алертам. Токен — в URL Bot API, в логи не пишется. */
export class TelegramClient {
  constructor(
    private readonly token: string,
    private readonly transport: TelegramTransport = postIpv4,
  ) {}

  private async call(method: string, body: Record<string, unknown> | FormData): Promise<unknown> {
    let payload: Buffer;
    let type: string;
    if (body instanceof FormData) {
      // Сериализуем multipart через Response: он сам ставит boundary.
      const r = new Response(body);
      payload = Buffer.from(await r.arrayBuffer());
      type = r.headers.get('content-type') ?? 'multipart/form-data';
    } else {
      payload = Buffer.from(JSON.stringify(body));
      type = 'application/json';
    }
    let res: { status: number; text: string };
    try {
      res = await this.transport(
        `https://api.telegram.org/bot${this.token}/${method}`,
        payload,
        type,
      );
    } catch (err) {
      throw new HttpError(
        504,
        `Telegram ${method}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    let json: unknown = null;
    try {
      json = JSON.parse(res.text);
    } catch {
      /* не JSON */
    }
    const parsed = okSchema.safeParse(json);
    if (res.status >= 400 || !parsed.success || !parsed.data.ok) {
      const text = parsed.success
        ? (parsed.data.description ?? `HTTP ${res.status}`)
        : `HTTP ${res.status}`;
      throw new HttpError(res.status || 502, `Telegram ${method}: ${text}`);
    }
    return parsed.data.result;
  }

  async getMe(): Promise<{ username: string }> {
    return z.looseObject({ username: z.string() }).parse(await this.call('getMe', {}));
  }

  setWebhook(url: string, secret: string) {
    return this.call('setWebhook', {
      url,
      secret_token: secret,
      allowed_updates: ['message', 'my_chat_member'],
      // Не сбрасываем накопленное: повторное подключение не должно терять /connect из групп.
      drop_pending_updates: false,
    });
  }

  sendMessage(chatId: string, text: string, threadId?: string | null) {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      ...(threadId ? { message_thread_id: Number(threadId) } : {}),
      link_preview_options: { is_disabled: true },
    });
  }

  sendPhoto(chatId: string, png: ArrayBuffer, caption: string, threadId?: string | null) {
    const form = new FormData();
    form.set('chat_id', chatId);
    if (threadId) form.set('message_thread_id', threadId);
    form.set('caption', caption.slice(0, CAPTION_LIMIT));
    form.set('photo', new Blob([png], { type: 'image/png' }), 'report.png');
    return this.call('sendPhoto', form);
  }

  /** Файл документом (PDF отчёта) с подписью. */
  sendDocument(
    chatId: string,
    file: Uint8Array,
    filename: string,
    caption: string,
    threadId?: string | null,
  ) {
    const form = new FormData();
    form.set('chat_id', chatId);
    if (threadId) form.set('message_thread_id', threadId);
    form.set('caption', caption.slice(0, CAPTION_LIMIT));
    form.set('document', new Blob([new Uint8Array(file)], { type: 'application/pdf' }), filename);
    return this.call('sendDocument', form);
  }
}

/** Обновление вебхука — только нужные поля. */
export const telegramUpdateSchema = z.looseObject({
  update_id: z.number(),
  my_chat_member: z
    .looseObject({
      chat: z.looseObject({
        id: z.number(),
        title: z.string().optional(),
        type: z.string(),
        is_forum: z.boolean().optional(),
        first_name: z.string().optional(),
      }),
      new_chat_member: z.looseObject({ status: z.string() }),
    })
    .optional(),
  message: z
    .looseObject({
      chat: z.looseObject({
        id: z.number(),
        title: z.string().optional(),
        type: z.string(),
        is_forum: z.boolean().optional(),
        first_name: z.string().optional(),
      }),
      text: z.string().optional(),
      message_thread_id: z.number().optional(),
      is_topic_message: z.boolean().optional(),
      reply_to_message: z
        .looseObject({ forum_topic_created: z.looseObject({ name: z.string() }).optional() })
        .optional(),
    })
    .optional(),
});
export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
