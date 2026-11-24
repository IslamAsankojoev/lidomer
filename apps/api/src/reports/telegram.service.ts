import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Db, telegramChats, workspaces } from '@lidomer/db';
import { INTEGRATION_LABELS, type IntegrationType, type TelegramChatDto } from '@lidomer/shared';
import { and, eq } from 'drizzle-orm';
import { ENV, type Env } from '../config/env';
import { DB } from '../db/db.module';
import { connectCode } from './signing';
import { TelegramClient, type TelegramUpdate } from './telegram.client';

const CONNECT_RE = /^\/connect(?:@\w+)?\s+([A-Z0-9]{8})\b/i;

/** Группы бота, привязка к компании по коду, алерты. */
@Injectable()
export class TelegramService {
  private readonly log = new Logger(TelegramService.name);
  private botUsername: string | null = null;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get configured(): boolean {
    return !!this.env.TELEGRAM_BOT_TOKEN;
  }

  client(): TelegramClient {
    if (!this.env.TELEGRAM_BOT_TOKEN)
      throw new Error('Бот Telegram не настроен: нет TELEGRAM_BOT_TOKEN');
    return new TelegramClient(this.env.TELEGRAM_BOT_TOKEN);
  }

  async username(): Promise<string | null> {
    if (!this.configured) return null;
    if (!this.botUsername) {
      try {
        this.botUsername = (await this.client().getMe()).username;
      } catch (err) {
        this.log.warn(`getMe не удался: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    }
    return this.botUsername;
  }

  codeFor(workspaceId: string): string {
    return connectCode(this.env.CRON_SECRET, workspaceId);
  }

  async listChats(workspaceId: string): Promise<TelegramChatDto[]> {
    const rows = await this.db
      .select()
      .from(telegramChats)
      .where(eq(telegramChats.workspaceId, workspaceId));
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      isForum: r.isForum,
      topics: r.topics as { id: string; name: string }[],
      active: r.active,
    }));
  }

  async chatBelongs(workspaceId: string, chatId: string): Promise<boolean> {
    const [r] = await this.db
      .select({ id: telegramChats.id })
      .from(telegramChats)
      .where(and(eq(telegramChats.id, chatId), eq(telegramChats.workspaceId, workspaceId)));
    return !!r;
  }

  /** Обработка вебхука: бот добавлен/удалён, команда /connect. */
  async handleUpdate(u: TelegramUpdate): Promise<void> {
    if (u.my_chat_member) {
      const { chat, new_chat_member } = u.my_chat_member;
      const active = ['member', 'administrator', 'creator'].includes(new_chat_member.status);
      await this.upsertChat(chat, { active });
      return;
    }
    const m = u.message;
    if (!m?.text) return;
    const match = CONNECT_RE.exec(m.text.trim());
    if (!match) return;
    const code = match[1]!.toUpperCase();
    const all = await this.db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces);
    const ws = all.find((w) => this.codeFor(w.id) === code);
    const thread = m.is_topic_message && m.message_thread_id ? String(m.message_thread_id) : null;
    if (!ws) {
      await this.safeSend(
        String(m.chat.id),
        'Код не подошёл. Скопируйте команду из кабинета: Интеграции → Telegram.',
        thread,
      );
      return;
    }
    const chat = await this.upsertChat(m.chat, { active: true, workspaceId: ws.id });
    if (thread) {
      const topics = (chat.topics as { id: string; name: string }[]).filter((t) => t.id !== thread);
      topics.push({
        id: thread,
        name: m.reply_to_message?.forum_topic_created?.name ?? `Тема ${thread}`,
      });
      await this.db.update(telegramChats).set({ topics }).where(eq(telegramChats.id, chat.id));
    }
    await this.safeSend(
      String(m.chat.id),
      `Готово: ${thread ? 'эта тема' : 'этот чат'} подключён к отчётам «${ws.name}».`,
      thread,
    );
  }

  private async upsertChat(
    chat: { id: number; title?: string; type: string; is_forum?: boolean; first_name?: string },
    patch: { active: boolean; workspaceId?: string },
  ) {
    const values = {
      id: String(chat.id),
      title: chat.title ?? chat.first_name ?? String(chat.id),
      type: chat.type,
      isForum: chat.is_forum ?? false,
      active: patch.active,
      ...(patch.workspaceId ? { workspaceId: patch.workspaceId } : {}),
    };
    const [row] = await this.db
      .insert(telegramChats)
      .values(values)
      .onConflictDoUpdate({ target: telegramChats.id, set: values })
      .returning();
    return row!;
  }

  async markInactive(chatId: string): Promise<void> {
    await this.db.update(telegramChats).set({ active: false }).where(eq(telegramChats.id, chatId));
  }

  private async safeSend(chatId: string, text: string, threadId: string | null): Promise<void> {
    try {
      await this.client().sendMessage(chatId, text, threadId);
    } catch (err) {
      this.log.warn(
        `Ответ в Telegram не отправлен: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async alertChatOf(workspaceId: string): Promise<string | null> {
    const [ws] = await this.db
      .select({ settings: workspaces.settings })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    return (
      ((ws?.settings as { alertChatId?: string } | null)?.alertChatId as string | undefined) ?? null
    );
  }

  async setAlertChat(workspaceId: string, chatId: string | null): Promise<void> {
    const [ws] = await this.db
      .select({ settings: workspaces.settings })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    await this.db
      .update(workspaces)
      .set({ settings: { ...((ws?.settings as object) ?? {}), alertChatId: chatId } })
      .where(eq(workspaces.id, workspaceId));
  }

  /** Сообщение о работе всего сервиса — в группы алертов всех компаний. */
  async systemAlert(text: string): Promise<void> {
    if (!this.configured) return;
    const rows = await this.db.select({ settings: workspaces.settings }).from(workspaces);
    const chats = new Set(
      rows
        .map((r) => (r.settings as { alertChatId?: string } | null)?.alertChatId)
        .filter((id): id is string => !!id),
    );
    for (const chatId of chats) await this.safeSend(chatId, text, null);
  }

  /** Сообщение в группу алертов компании. Без персональных данных. */
  async alert(workspaceId: string, text: string): Promise<void> {
    if (!this.configured) return;
    const chatId = await this.alertChatOf(workspaceId);
    if (!chatId) return;
    await this.safeSend(chatId, text, null);
  }

  /** Алерт: журнал лидов и метрики перестали пересчитываться. `error` — уже без данных клиентов. */
  async reconcileAlert(workspaceId: string, error: string): Promise<void> {
    await this.alert(
      workspaceId,
      `⚠️ Лиды и метрики не пересчитываются: ${error}\n\n` +
        'Синхронизация идёт, но кабинет и отчёты показывают цифры последнего удачного пересчёта. ' +
        'Отчёты уйдут с пометкой.',
    );
  }

  async reconcileRecovered(workspaceId: string): Promise<void> {
    await this.alert(workspaceId, '✅ Лиды и метрики снова пересчитываются: цифры актуальные.');
  }

  /** Алерт: интеграция в статусе «Ошибка» или «Нужно переподключить». Без персональных данных. */
  async integrationAlert(
    workspaceId: string,
    type: IntegrationType,
    reauth: boolean,
    message: string,
  ): Promise<void> {
    const title = reauth ? 'нужно переподключить' : 'ошибка синхронизации';
    await this.alert(
      workspaceId,
      `⚠️ ${INTEGRATION_LABELS[type]}: ${title}.\n${message}\n\nОтчёты уйдут с пометкой о данных, нули не подставляются.`,
    );
  }
}
