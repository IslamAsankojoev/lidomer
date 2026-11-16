import { Body, Controller, Get, Inject, Injectable, Put } from '@nestjs/common';
import { b24Deals, b24Stages, type Db } from '@lidomer/db';
import {
  type B24Stage,
  defaultDealStatus,
  type DealStatus,
  normalizeStageSemantics,
  type UpdateStageMapRequest,
  updateStageMapRequestSchema,
} from '@lidomer/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { CurrentUser, CurrentWorkspace, RequirePermission } from '../auth/decorators';
import type { AuthUser, WorkspaceContext } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { DB } from '../db/db.module';
import { MembershipRepository } from '../workspaces/membership.repository';

/** Стадии сделок Bitrix24 и их сопоставление со статусами «в работе / продажа / отказ». */
@Injectable()
export class B24StagesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(workspaceId: string): Promise<B24Stage[]> {
    // Колонки внешней таблицы — с явным именем таблицы, иначе внутри подзапроса они
    // сравниваются сами с собой и каждая стадия получает все сделки.
    const deals = sql<number>`(select count(*)::int from ${b24Deals} d where d.workspace_id = "b24_stages"."workspace_id" and d.stage_id = "b24_stages"."stage_id")`;
    const rows = await this.db
      .select({
        stageId: b24Stages.stageId,
        categoryId: b24Stages.categoryId,
        categoryName: b24Stages.categoryName,
        name: b24Stages.name,
        semantics: b24Stages.semantics,
        mappedStatus: b24Stages.mappedStatus,
        deals,
      })
      .from(b24Stages)
      .where(eq(b24Stages.workspaceId, workspaceId))
      .orderBy(asc(b24Stages.categoryId), asc(b24Stages.sort));
    return rows.map((r) => ({
      ...r,
      semantics: normalizeStageSemantics(r.semantics),
      status: r.mappedStatus ?? defaultDealStatus(r.semantics),
    }));
  }

  /** Сохранить выбор владельца. Возвращает прежние значения для журнала. */
  async update(
    workspaceId: string,
    mappings: { stageId: string; status: DealStatus | null }[],
  ): Promise<Record<string, DealStatus | null>> {
    return this.db.transaction(async (tx) => {
      const ids = mappings.map((m) => m.stageId);
      const before = await tx
        .select({ stageId: b24Stages.stageId, mappedStatus: b24Stages.mappedStatus })
        .from(b24Stages)
        .where(and(eq(b24Stages.workspaceId, workspaceId), inArray(b24Stages.stageId, ids)));
      for (const m of mappings) {
        await tx
          .update(b24Stages)
          .set({ mappedStatus: m.status })
          .where(and(eq(b24Stages.workspaceId, workspaceId), eq(b24Stages.stageId, m.stageId)));
      }
      return Object.fromEntries(before.map((b) => [b.stageId, b.mappedStatus]));
    });
  }
}

@Controller('integrations/bitrix24/stages')
export class B24StagesController {
  constructor(
    @Inject(B24StagesRepository) private readonly repo: B24StagesRepository,
    @Inject(MembershipRepository) private readonly membership: MembershipRepository,
  ) {}

  @Get()
  @RequirePermission('integrations:read')
  async list(@CurrentWorkspace() ws: WorkspaceContext): Promise<{ stages: B24Stage[] }> {
    return { stages: await this.repo.list(ws.workspaceId) };
  }

  @Put()
  @RequirePermission('integrations:manage')
  async update(
    @CurrentUser() user: AuthUser,
    @CurrentWorkspace() ws: WorkspaceContext,
    @Body(new ZodPipe(updateStageMapRequestSchema)) body: UpdateStageMapRequest,
  ): Promise<{ stages: B24Stage[] }> {
    const before = await this.repo.update(ws.workspaceId, body.mappings);
    await this.membership.audit({
      workspaceId: ws.workspaceId,
      actorUserId: user.id,
      action: 'b24.stage_map',
      entityType: 'b24_stages',
      before,
      after: Object.fromEntries(body.mappings.map((m) => [m.stageId, m.status])),
    });
    return { stages: await this.repo.list(ws.workspaceId) };
  }
}
