import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/decorators';
import { ENV, type Env } from '../config/env';
import { JobRunner, type TickReport } from './job-runner';
import { type SchemaCheck, Watchdog, type WatchdogVerdict } from './watchdog';

/** Бюджет одного вызова: с запасом до лимита функции Vercel. */
const TICK_BUDGET_MS = 55_000;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** `tick` вызывает Supabase Cron раз в минуту, сторожа — GitHub Actions. Без входа, только с секретом. */
@Controller('jobs')
export class JobsController {
  constructor(
    @Inject(JobRunner) private readonly runner: JobRunner,
    @Inject(Watchdog) private readonly watchdog: Watchdog,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post('tick')
  @HttpCode(200)
  async tick(@Headers('authorization') auth?: string): Promise<TickReport> {
    this.authorize(auth);
    return this.runner.tick(TICK_BUDGET_MS);
  }

  /**
   * Сторож расписания: вызывается извне (GitHub Actions) раз в 10 минут.
   * Пульс `tick` старше 10 минут или база отстала от миграций кода — алерт в Telegram;
   * ответ 503, чтобы упал и сам вызов.
   */
  @Public()
  @Get('watchdog')
  async watchdogCheck(
    @Headers('authorization') auth?: string,
  ): Promise<{ verdict: WatchdogVerdict; lastTickAt: string | null; schema: SchemaCheck }> {
    this.authorize(auth);
    const result = { ...(await this.watchdog.check()), schema: await this.watchdog.checkSchema() };
    if (
      result.verdict === 'stale' ||
      result.verdict === 'still_stale' ||
      result.schema.verdict === 'behind' ||
      result.schema.verdict === 'still_behind'
    )
      throw new ServiceUnavailableException(result);
    return result;
  }

  private authorize(auth?: string): void {
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token || !safeEqual(token, this.env.CRON_SECRET)) throw new UnauthorizedException();
  }
}
