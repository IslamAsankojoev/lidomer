import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type ConnectGreenApiRequest,
  type IntegrationStatus,
  INTEGRATION_LABELS,
  type WhatsappGroup,
  type WhatsappStatus,
} from '@lidomer/shared';
import { HttpError } from '../common/http';
import { SecretBox } from '../common/secret-box';
import { ENV, type Env } from '../config/env';
import {
  type IntegrationRow,
  IntegrationsRepository,
} from '../integrations/integrations.repository';
import { GreenApiClient, type GreenApiKeys, type GreenState } from './green-api.client';
import { TelegramService } from './telegram.service';

type GreenSettings = {
  idInstance?: string;
  phone?: string | null;
  state?: string | null;
  groups?: WhatsappGroup[];
  groupsUpdatedAt?: string | null;
};

/** Статус интеграции по состоянию номера в Green API. */
export function greenStateToStatus(state: GreenState): {
  status: IntegrationStatus;
  error: string | null;
} {
  switch (state) {
    case 'authorized':
      return { status: 'connected', error: null };
    case 'notAuthorized':
      return {
        status: 'reauth_required',
        error: 'Номер отвязан — отсканируйте QR в консоли Green API',
      };
    case 'blocked':
      return { status: 'error', error: 'WhatsApp заблокировал номер' };
    case 'suspended':
    case 'yellowCard':
      return { status: 'error', error: 'WhatsApp временно ограничил отправку с номера' };
    case 'starting':
    case 'sleepMode':
      return {
        status: 'error',
        error: 'Номер запускается или телефон выключен — проверьте через 5 минут',
      };
    default:
      return { status: 'error', error: `Неизвестное состояние номера: ${state}` };
  }
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * WhatsApp компании через Green API: ключи в `integrations` (тип green_api), группы номера —
 * в settings. Номер и названия групп — только для экрана кабинета: не в логи и не в алерты.
 */
@Injectable()
export class WhatsappService {
  private readonly box: SecretBox;
  /** Фабрика клиента — тесты подменяют её. */
  clientFor: (keys: GreenApiKeys) => GreenApiClient = (keys) => new GreenApiClient(keys);

  constructor(
    @Inject(ENV) env: Env,
    @Inject(IntegrationsRepository) private readonly repo: IntegrationsRepository,
    @Inject(TelegramService) private readonly telegram: TelegramService,
  ) {
    this.box = new SecretBox(env.ENCRYPTION_KEY);
  }

  private async row(workspaceId: string): Promise<IntegrationRow | null> {
    const row = await this.repo.get(workspaceId, 'green_api');
    return row && row.status !== 'disabled' && row.secretsEncrypted ? row : null;
  }

  private keys(row: IntegrationRow): GreenApiKeys {
    return this.box.open(row.secretsEncrypted!) as GreenApiKeys;
  }

  async status(workspaceId: string): Promise<WhatsappStatus> {
    const row = await this.row(workspaceId);
    if (!row)
      return {
        status: 'not_connected',
        state: null,
        phone: null,
        idInstance: null,
        maskedToken: null,
        groups: [],
        groupsUpdatedAt: null,
        lastError: null,
      };
    const s = (row.settings ?? {}) as GreenSettings;
    let maskedToken: string | null;
    try {
      maskedToken = `••••${this.keys(row).apiTokenInstance.slice(-4)}`;
    } catch {
      maskedToken = 'не расшифровывается — подключите заново';
    }
    return {
      status: row.status,
      state: s.state ?? null,
      phone: s.phone ?? null,
      idInstance: s.idInstance ?? null,
      maskedToken,
      groups: s.groups ?? [],
      groupsUpdatedAt: s.groupsUpdatedAt ?? null,
      lastError: row.lastError,
    };
  }

  async connect(workspaceId: string, input: ConnectGreenApiRequest): Promise<WhatsappStatus> {
    // Один инстанс — одна компания: иначе она увидит чужие группы и сможет туда отправить.
    if (await this.repo.findGreenInstanceElsewhere(input.idInstance, workspaceId))
      throw new ConflictException('Этот номер уже подключён к другой компании');
    let state: GreenState;
    try {
      state = await this.clientFor(input).getState();
    } catch (err) {
      throw new BadRequestException(`Не удалось подключиться: ${errText(err)}`);
    }
    const row = await this.repo.save({
      workspaceId,
      type: 'green_api',
      name: INTEGRATION_LABELS.green_api,
      secretsEncrypted: this.box.seal(input),
      settings: { idInstance: input.idInstance },
    });
    // Статус сразу по состоянию номера: подключение отвязанного номера — не «потеря связи» для алерта.
    const { status, error } = greenStateToStatus(state);
    await this.repo.setStatus(row.id, status, error);
    return this.refresh(workspaceId);
  }

  /** Состояние, номер и группы (только у авторизованного номера) → settings и статус. */
  async refresh(workspaceId: string): Promise<WhatsappStatus> {
    const row = await this.row(workspaceId);
    if (!row) throw new NotFoundException('WhatsApp не подключён');
    const client = this.clientFor(this.keys(row));
    const settings = (row.settings ?? {}) as GreenSettings;
    try {
      const state = await client.getState();
      const wa = await client.getWaSettings();
      const authorized = state === 'authorized';
      const groups = authorized ? await client.getGroups() : (settings.groups ?? []);
      await this.repo.setSettings(row.id, {
        ...settings,
        phone: wa.phone,
        state,
        groups,
        groupsUpdatedAt: authorized ? new Date().toISOString() : (settings.groupsUpdatedAt ?? null),
      });
      await this.applyState(row, state);
    } catch (err) {
      await this.repo.setStatus(row.id, 'error', errText(err));
    }
    return this.status(workspaceId);
  }

  async disconnect(workspaceId: string): Promise<void> {
    const row = await this.repo.get(workspaceId, 'green_api');
    if (row) await this.repo.disconnect(row.id);
  }

  /** Группа есть среди групп подключённого номера компании. */
  async chatBelongs(workspaceId: string, chatId: string): Promise<boolean> {
    const row = await this.row(workspaceId);
    return !!row && ((row.settings as GreenSettings).groups ?? []).some((g) => g.id === chatId);
  }

  /**
   * Отправить файл отчёта. Перед отправкой — состояние номера: не authorized → файл не отправляем
   * (Green API держит сообщения неавторизованного номера 24 часа и отправит их позже).
   */
  async sendReport(
    workspaceId: string,
    chatId: string,
    file: Uint8Array | ArrayBuffer,
    fileName: string,
    caption: string,
  ): Promise<void> {
    const row = await this.row(workspaceId);
    if (!row) throw new Error('WhatsApp не подключён');
    const client = this.clientFor(this.keys(row));
    const state = await client.getState();
    if (state !== 'authorized') {
      const { error } = await this.applyState(row, state);
      throw new HttpError(409, `WhatsApp: ${error}`);
    }
    await client.sendFile(chatId, file, fileName, caption);
  }

  /** Статус по состоянию номера; при потере подключения — один алерт в Telegram. */
  private async applyState(row: IntegrationRow, state: GreenState) {
    const next = greenStateToStatus(state);
    await this.repo.setStatus(row.id, next.status, next.error);
    if (row.status === 'connected' && next.status !== 'connected')
      await this.telegram.alert(
        row.workspaceId,
        `⚠️ WhatsApp: ${next.error}. Отчёты в WhatsApp не уходят, пока номер не подключён снова (Интеграции → WhatsApp).`,
      );
    return next;
  }
}
