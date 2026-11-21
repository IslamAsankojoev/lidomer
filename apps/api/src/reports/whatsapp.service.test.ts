import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env';
import type {
  IntegrationRow,
  IntegrationsRepository,
} from '../integrations/integrations.repository';
import { SecretBox } from '../common/secret-box';
import type { GreenApiClient } from './green-api.client';
import type { TelegramService } from './telegram.service';
import { greenStateToStatus, WhatsappService } from './whatsapp.service';

const ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
// Фейковые ключи и строка подключения для тестов.
const KEYS = {
  apiUrl: 'https://api.green-api.com',
  mediaUrl: 'https://media.green-api.com',
  idInstance: '1101000001',
  apiTokenInstance: 'secret-token-0123456789abcdef',
};

function setup(state: string) {
  const row = {
    id: 'i1',
    workspaceId: 'ws',
    type: 'green_api',
    status: 'connected',
    secretsEncrypted: new SecretBox(ENCRYPTION_KEY).seal(KEYS),
    settings: { idInstance: KEYS.idInstance, groups: [{ id: '1@g.us', name: 'Отчёты' }] },
    lastError: null,
  } as unknown as IntegrationRow;
  const repo = { get: vi.fn(async () => row), setStatus: vi.fn(async () => {}) };
  const telegram = { alert: vi.fn(async (_ws: string, _text: string) => {}) };
  const client = {
    getState: vi.fn(async () => state),
    sendFile: vi.fn(async () => ({ idMessage: 'x' })),
  };
  const svc = new WhatsappService(
    { ENCRYPTION_KEY } as Env,
    repo as unknown as IntegrationsRepository,
    telegram as unknown as TelegramService,
  );
  svc.clientFor = () => client as unknown as GreenApiClient;
  return { svc, repo, telegram, client };
}

describe('WhatsappService', () => {
  it('номер не авторизован — файл не отправляется, статус и один алерт', async () => {
    const { svc, repo, telegram, client } = setup('notAuthorized');
    await expect(
      svc.sendReport('ws', '1@g.us', new Uint8Array([1]), 'report.png', 'x'),
    ).rejects.toThrow('WhatsApp: Номер отвязан — отсканируйте QR в консоли Green API');
    expect(client.sendFile).not.toHaveBeenCalled();
    expect(repo.setStatus).toHaveBeenCalledWith('i1', 'reauth_required', expect.any(String));
    expect(telegram.alert).toHaveBeenCalledTimes(1);
    expect(String(telegram.alert.mock.calls[0]![1])).not.toContain(KEYS.apiTokenInstance);
  });
  it('авторизован — файл уходит', async () => {
    const { svc, client } = setup('authorized');
    await svc.sendReport('ws', '1@g.us', new Uint8Array([1]), 'report.png', 'подпись');
    expect(client.sendFile).toHaveBeenCalledWith(
      '1@g.us',
      expect.anything(),
      'report.png',
      'подпись',
    );
  });
  it('группа принадлежит компании, только если она среди групп номера', async () => {
    const { svc } = setup('authorized');
    await expect(svc.chatBelongs('ws', '1@g.us')).resolves.toBe(true);
    await expect(svc.chatBelongs('ws', '2@g.us')).resolves.toBe(false);
  });
});

describe('greenStateToStatus', () => {
  it('все состояния', () => {
    expect(greenStateToStatus('authorized')).toEqual({ status: 'connected', error: null });
    expect(greenStateToStatus('notAuthorized').status).toBe('reauth_required');
    expect(greenStateToStatus('blocked')).toEqual({
      status: 'error',
      error: 'WhatsApp заблокировал номер',
    });
    for (const s of ['suspended', 'yellowCard'])
      expect(greenStateToStatus(s).error).toBe('WhatsApp временно ограничил отправку с номера');
    for (const s of ['starting', 'sleepMode'])
      expect(greenStateToStatus(s).error).toBe(
        'Номер запускается или телефон выключен — проверьте через 5 минут',
      );
  });
});
