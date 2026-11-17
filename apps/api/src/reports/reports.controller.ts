import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type ReportInput,
  reportInputSchema,
  type ReportPreviewRequest,
  reportPreviewRequestSchema,
  type ReportPreviewResponse,
  type ReportSnapshot,
} from '@lidomer/shared';
import { z } from 'zod';
import { CurrentUser, CurrentWorkspace, Public, RequirePermission } from '../auth/decorators';
import type { AuthUser, WorkspaceContext } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { ENV, type Env } from '../config/env';
import { MembershipRepository } from '../workspaces/membership.repository';
import { ReportsService } from './reports.service';
import { verifyRun } from './signing';
import { TelegramService } from './telegram.service';

const idParam = new ZodPipe(z.uuid());

@Controller()
export class ReportsController {
  constructor(
    @Inject(ReportsService) private readonly reports: ReportsService,
    @Inject(TelegramService) private readonly telegram: TelegramService,
    @Inject(MembershipRepository) private readonly membership: MembershipRepository,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('reports')
  @RequirePermission('reports:read')
  async list(@CurrentWorkspace() ws: WorkspaceContext) {
    return { reports: await this.reports.list(ws.workspaceId) };
  }

  /** Предпросмотр в конструкторе: картинка рисуется в браузере по этому снимку, ничего не отправляется. */
  @Post('reports/preview')
  @HttpCode(200)
  @RequirePermission('reports:read')
  preview(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Body(new ZodPipe(reportPreviewRequestSchema)) body: ReportPreviewRequest,
  ): Promise<ReportPreviewResponse> {
    return this.reports.preview(ws.workspaceId, body);
  }

  @Post('reports')
  @RequirePermission('reports:manage')
  async create(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() ws: WorkspaceContext,
    @Body(new ZodPipe(reportInputSchema)) body: ReportInput,
  ) {
    const id = await this.reports.save(ws.workspaceId, user.id, body);
    await this.audit(ws, user, 'report.create', id, body);
    return { id };
  }

  @Put('reports/:id')
  @RequirePermission('reports:manage')
  async update(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('id', idParam) id: string,
    @Body(new ZodPipe(reportInputSchema)) body: ReportInput,
  ) {
    await this.reports.save(ws.workspaceId, user.id, body, id);
    await this.audit(ws, user, 'report.update', id, body);
    return { id };
  }

  @Delete('reports/:id')
  @HttpCode(204)
  @RequirePermission('reports:manage')
  async remove(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('id', idParam) id: string,
  ) {
    await this.reports.remove(ws.workspaceId, id);
    await this.audit(ws, user, 'report.delete', id, null);
  }

  /** «Отправить тест мне»: сразу, не дожидаясь свежих данных, в выбранный чат. */
  @Post('reports/:id/test')
  @HttpCode(200)
  @RequirePermission('reports:manage')
  async test(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('id', idParam) id: string,
    @Body(new ZodPipe(z.object({ chatId: z.string(), threadId: z.string().nullable() })))
    body: { chatId: string; threadId: string | null },
  ) {
    if (!this.telegram.configured) throw new BadRequestException('Бот Telegram не настроен');
    if (!(await this.telegram.chatBelongs(ws.workspaceId, body.chatId)))
      throw new BadRequestException('Чат не подключён');
    const runId = await this.reports.createTestRun(ws.workspaceId, id);
    try {
      await this.reports.processRun(runId, body);
    } catch (err) {
      await this.reports.markFailed(runId, err instanceof Error ? err.message : String(err));
    }
    const [run] = await this.reports.runs(ws.workspaceId, id);
    return run;
  }

  @Get('reports/runs')
  @RequirePermission('reports:read')
  async runs(@CurrentWorkspace() ws: WorkspaceContext, @Query('reportId') reportId?: string) {
    if (reportId && !z.uuid().safeParse(reportId).success)
      throw new BadRequestException('Неверный отчёт');
    return { runs: await this.reports.runs(ws.workspaceId, reportId) };
  }

  /** Снимок цифр для картинки. Без входа, но только по подписанной ссылке со сроком. */
  @Public()
  @Get('internal/report-runs/:id/snapshot')
  async snapshot(
    @Param('id', idParam) id: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
  ): Promise<ReportSnapshot> {
    if (!verifyRun(this.env.CRON_SECRET, id, Number(exp), String(sig ?? '')))
      throw new UnauthorizedException();
    const snap = await this.reports.getSnapshot(id);
    if (!snap) throw new NotFoundException();
    return snap;
  }

  private audit(ws: WorkspaceContext, user: AuthUser, action: string, id: string, after: unknown) {
    return this.membership.audit({
      workspaceId: ws.workspaceId,
      actorUserId: user.id,
      action,
      entityType: 'report',
      entityId: id,
      after: after as object,
    });
  }
}
