import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { CurrentWorkspace, Public, RequirePermission } from '../auth/decorators';
import type { AppRequest, WorkspaceContext } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { ENV, type Env } from '../config/env';
import { telegramWebhookSecret } from './signing';
import { telegramUpdateSchema } from './telegram.client';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(
    @Inject(TelegramService) private readonly telegram: TelegramService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Вебхук Bot API. Проверяется секрет из заголовка; на мусор отвечаем 200, чтобы Telegram не повторял. */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers('x-telegram-bot-api-secret-token') token: string | undefined,
    @Body() body: unknown,
  ) {
    const expected = Buffer.from(telegramWebhookSecret(this.env.CRON_SECRET));
    const got = Buffer.from(token ?? '');
    if (expected.length !== got.length || !timingSafeEqual(expected, got))
      throw new UnauthorizedException();
    const parsed = telegramUpdateSchema.safeParse(body);
    if (parsed.success) await this.telegram.handleUpdate(parsed.data);
    return { ok: true };
  }

  @Get('chats')
  @RequirePermission('reports:read')
  async chats(@CurrentWorkspace() ws: WorkspaceContext) {
    return {
      chats: await this.telegram.listChats(ws.workspaceId),
      connectCode: this.telegram.codeFor(ws.workspaceId),
      botUsername: await this.telegram.username(),
      configured: this.telegram.configured,
      alertChatId: await this.telegram.alertChatOf(ws.workspaceId),
    };
  }

  /** Подключить вебхук бота к этому api (один раз после внесения токена). */
  @Post('setup')
  @HttpCode(200)
  @RequirePermission('settings:manage')
  async setup(@Req() req: AppRequest) {
    const host = String(req.headers['x-forwarded-host'] ?? req.headers.host);
    const proto = String(req.headers['x-forwarded-proto'] ?? 'https');
    await this.telegram
      .client()
      .setWebhook(
        `${proto}://${host}/telegram/webhook`,
        telegramWebhookSecret(this.env.CRON_SECRET),
      );
    return { ok: true, botUsername: await this.telegram.username() };
  }

  @Put('alert-chat')
  @HttpCode(204)
  @RequirePermission('reports:manage')
  async alertChat(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Body(new ZodPipe(z.object({ chatId: z.string().nullable() }))) body: { chatId: string | null },
  ): Promise<void> {
    if (body.chatId && !(await this.telegram.chatBelongs(ws.workspaceId, body.chatId))) {
      throw new UnauthorizedException('Чат не подключён к компании');
    }
    await this.telegram.setAlertChat(ws.workspaceId, body.chatId);
  }
}
