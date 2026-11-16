import { Controller, Headers, HttpCode, Inject, Post, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/decorators';
import { ENV, type Env } from '../config/env';
import { JobRunner, type TickReport } from './job-runner';

/** Бюджет одного вызова: с запасом до лимита функции Vercel. */
const TICK_BUDGET_MS = 55_000;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Вызывается Supabase Cron раз в минуту. Без входа пользователя, но только с секретом. */
@Controller('jobs')
export class JobsController {
  constructor(
    @Inject(JobRunner) private readonly runner: JobRunner,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post('tick')
  @HttpCode(200)
  async tick(@Headers('authorization') auth?: string): Promise<TickReport> {
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token || !safeEqual(token, this.env.CRON_SECRET)) throw new UnauthorizedException();
    return this.runner.tick(TICK_BUDGET_MS);
  }
}
