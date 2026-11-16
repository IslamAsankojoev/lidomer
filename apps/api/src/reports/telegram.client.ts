import { z } from 'zod';
import { HttpError } from '../common/http';

const okSchema = z.looseObject({
  ok: z.boolean(),
  description: z.string().optional(),
  result: z.unknown(),
});

/** Подпись фото в Telegram — до 1024 символов. */
export const CAPTION_LIMIT = 1024;

/** Тонкий клиент Bot API: только то, что нужно отчётам и алертам. Токен — в URL Bot API, в логи не пишется. */
export class TelegramClient {
  constructor(
    private readonly token: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async call(method: string, body: Record<string, unknown> | FormData): Promise<unknown> {
    const isForm = body instanceof FormData;
    const res = await this.fetchFn(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: isForm ? undefined : { 'Content-Type': 'application/json' },
      body: isForm ? body : JSON.stringify(body),
    });
    const parsed = okSchema.safeParse(await res.json().catch(() => null));
    if (!res.ok || !parsed.success || !parsed.data.ok) {
      const text = parsed.success
        ? (parsed.data.description ?? `HTTP ${res.status}`)
        : `HTTP ${res.status}`;
      throw new HttpError(res.status, `Telegram ${method}: ${text}`);
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
      drop_pending_updates: true,
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
