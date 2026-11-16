import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  INTEGRATION_LABELS,
  type IntegrationSummary,
  type IntegrationType,
  type SyncRunSummary,
} from '@lidomer/shared';
import { HttpError } from '../common/http';
import { SecretBox } from '../common/secret-box';
import { JobQueue } from '../jobs/queue';
import { type AdapterRegistry, SOURCE_ADAPTERS } from '../sources/registry';
import type { JobSpec, SourceAdapter } from '../sources/types';
import { MembershipRepository } from '../workspaces/membership.repository';
import { type IntegrationRow, IntegrationsRepository } from './integrations.repository';

/** Источники данных первой версии (Telegram — канал отправки, его экран — Этап 5). */
export const SOURCE_TYPES: IntegrationType[] = ['meta_ads', 'ward', 'bitrix24'];

export const SECRET_BOX = Symbol('SECRET_BOX');

/** Понятный текст ошибки источника для карточки и журнала (без персональных данных). */
export function describeError(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 401 || err.status === 403)
      return `${err.message} — проверьте ключ или доступ`;
    return err.message;
  }
  if (err instanceof Error && err.name === 'ZodError')
    return 'Источник вернул данные в неожиданном формате';
  return err instanceof Error ? err.message : 'Неизвестная ошибка';
}

@Injectable()
export class IntegrationsService {
  constructor(
    @Inject(IntegrationsRepository) private readonly repo: IntegrationsRepository,
    @Inject(MembershipRepository) private readonly membership: MembershipRepository,
    @Inject(JobQueue) private readonly queue: JobQueue,
    @Inject(SOURCE_ADAPTERS) private readonly adapters: AdapterRegistry,
    @Inject(SECRET_BOX) private readonly box: SecretBox,
  ) {}

  adapter(type: IntegrationType): SourceAdapter<unknown> {
    const a = this.adapters[type];
    if (!a) throw new NotFoundException('Такого источника нет');
    return a;
  }

  async list(workspaceId: string): Promise<IntegrationSummary[]> {
    const rows = await this.repo.list(workspaceId);
    return Promise.all(
      SOURCE_TYPES.map(async (type) => {
        const row = rows.find((r) => r.type === type);
        return this.summarize(type, row);
      }),
    );
  }

  async get(workspaceId: string, type: IntegrationType): Promise<IntegrationSummary> {
    this.adapter(type);
    return this.summarize(type, (await this.repo.get(workspaceId, type)) ?? undefined);
  }

  private async summarize(
    type: IntegrationType,
    row?: IntegrationRow,
  ): Promise<IntegrationSummary> {
    if (!row) {
      return {
        type,
        name: INTEGRATION_LABELS[type],
        status: 'not_connected',
        lastSyncAt: null,
        lastError: null,
        maskedSecrets: {},
        details: {},
        warnings: [],
        pendingJobs: 0,
      };
    }
    const settings = (row.settings ?? {}) as {
      details?: Record<string, string>;
      warnings?: string[];
    };
    let maskedSecrets: Record<string, string> = {};
    if (row.secretsEncrypted) {
      try {
        maskedSecrets = this.adapter(type).mask(this.box.open(row.secretsEncrypted));
      } catch {
        maskedSecrets = { ключ: 'не расшифровывается — подключите заново' };
      }
    }
    return {
      type,
      name: row.name,
      status: row.status,
      lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
      lastError: row.lastError,
      maskedSecrets,
      details: settings.details ?? {},
      warnings: settings.warnings ?? [],
      pendingJobs: row.status === 'disabled' ? 0 : await this.repo.pendingJobs(row.id),
    };
  }

  /** Проверить ключи, сохранить зашифрованными и поставить загрузку истории. */
  async connect(
    workspaceId: string,
    actorId: string,
    type: IntegrationType,
    rawSecrets: unknown,
  ): Promise<IntegrationSummary> {
    const adapter = this.adapter(type);
    let input = rawSecrets;
    if (adapter.prepareSecrets) {
      try {
        input = await adapter.prepareSecrets(rawSecrets);
      } catch (err) {
        throw new BadRequestException(`Не удалось подключиться: ${describeError(err)}`);
      }
    }
    const parsed = adapter.secretsSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    let test;
    try {
      test = await adapter.test(parsed.data);
    } catch (err) {
      throw new BadRequestException(`Не удалось подключиться: ${describeError(err)}`);
    }

    const row = await this.repo.save({
      workspaceId,
      type,
      name: INTEGRATION_LABELS[type],
      secretsEncrypted: this.box.seal(parsed.data),
      settings: { details: test.details, warnings: test.warnings },
    });
    const now = new Date();
    const timezone = await this.repo.timezoneOf(workspaceId);
    // История сразу; плановые окна отсчитываются от этого момента.
    await this.enqueue(row, adapter.initialJobs(now, timezone));
    await this.repo.setSyncState(row.id, adapter.dueJobs({}, now, timezone).state);
    await this.repo.setStatus(row.id, 'syncing');
    await this.membership.audit({
      workspaceId,
      actorUserId: actorId,
      action: 'integration.connect',
      entityType: 'integration',
      entityId: row.id,
      after: { type, details: test.details },
    });
    return this.get(workspaceId, type);
  }

  async test(workspaceId: string, type: IntegrationType): Promise<IntegrationSummary> {
    const { row, secrets, adapter } = await this.loadConnected(workspaceId, type);
    try {
      await adapter.test(secrets);
      await this.repo.setStatus(row.id, 'connected');
    } catch (err) {
      const auth = err instanceof HttpError && (err.status === 401 || err.status === 403);
      await this.repo.setStatus(row.id, auth ? 'reauth_required' : 'error', describeError(err));
    }
    return this.get(workspaceId, type);
  }

  /** «Синхронизировать»: свежее окно источника прямо сейчас. */
  async syncNow(workspaceId: string, type: IntegrationType): Promise<IntegrationSummary> {
    const { row, adapter } = await this.loadConnected(workspaceId, type);
    const timezone = await this.repo.timezoneOf(workspaceId);
    const { jobs } = adapter.dueJobs({}, new Date(), timezone);
    await this.enqueue(row, jobs);
    await this.repo.setStatus(row.id, 'syncing');
    return this.get(workspaceId, type);
  }

  async disconnect(
    workspaceId: string,
    actorId: string,
    type: IntegrationType,
  ): Promise<IntegrationSummary> {
    const row = await this.repo.get(workspaceId, type);
    if (!row) throw new NotFoundException('Подключение не найдено');
    await this.repo.disconnect(row.id);
    await this.membership.audit({
      workspaceId,
      actorUserId: actorId,
      action: 'integration.disconnect',
      entityType: 'integration',
      entityId: row.id,
      before: { type },
    });
    return this.get(workspaceId, type);
  }

  async runs(workspaceId: string, type: IntegrationType): Promise<SyncRunSummary[]> {
    const row = await this.repo.get(workspaceId, type);
    if (!row) return [];
    const runs = await this.repo.listRuns(row.id);
    return runs.map((r) => ({
      id: r.id,
      job: r.job,
      periodFrom: r.periodFrom,
      periodTo: r.periodTo,
      status: r.status,
      records: r.records,
      error: r.error,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    }));
  }

  async enqueue(row: Pick<IntegrationRow, 'id' | 'workspaceId'>, jobs: JobSpec[]): Promise<void> {
    await this.queue.send(
      jobs.map((j) => ({
        workspaceId: row.workspaceId,
        integrationId: row.id,
        kind: j.kind,
        params: j.params,
      })),
    );
  }

  private async loadConnected(workspaceId: string, type: IntegrationType) {
    const adapter = this.adapter(type);
    const row = await this.repo.get(workspaceId, type);
    if (!row?.secretsEncrypted || row.status === 'disabled') {
      throw new NotFoundException('Источник не подключён');
    }
    return { row, adapter, secrets: this.box.open(row.secretsEncrypted) };
  }
}
