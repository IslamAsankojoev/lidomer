import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Role } from '@lidomer/shared';
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type JWK } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/create-app';
import { JWT_KEYS } from '../src/auth/jwt';
import { ENV, loadEnv } from '../src/config/env';
import { MembershipRepository } from '../src/workspaces/membership.repository';
import { SupabaseAdmin } from '../src/workspaces/supabase-admin';

// Тестовые данные (фейковые): две компании, пользователи с разными ролями.
const SUPABASE_URL = 'https://test-project.supabase.co';
const WS_A = '00000000-0000-4000-8000-00000000000a';
const WS_B = '00000000-0000-4000-8000-00000000000b';
const users: Record<Role | 'outsider', string> = {
  owner: '10000000-0000-4000-8000-000000000001',
  marketer: '10000000-0000-4000-8000-000000000002',
  sales: '10000000-0000-4000-8000-000000000003',
  viewer: '10000000-0000-4000-8000-000000000004',
  outsider: '10000000-0000-4000-8000-000000000005',
};

class FakeMembership {
  roles = new Map<string, Role>([
    [`${WS_A}:${users.owner}`, 'owner'],
    [`${WS_A}:${users.marketer}`, 'marketer'],
    [`${WS_A}:${users.sales}`, 'sales'],
    [`${WS_A}:${users.viewer}`, 'viewer'],
    [`${WS_B}:${users.outsider}`, 'owner'],
  ]);
  audits: unknown[] = [];
  async findRole(userId: string, ws: string) {
    return this.roles.get(`${ws}:${userId}`) ?? null;
  }
  async listWorkspacesOf(userId: string) {
    return [...this.roles.entries()]
      .filter(([k]) => k.endsWith(userId))
      .map(([k, role]) => ({
        id: k.split(':')[0]!,
        name: 'Тест',
        timezone: 'Asia/Bishkek',
        displayCurrency: 'USD',
        role,
      }));
  }
  async listMembers(ws: string) {
    return [...this.roles.entries()]
      .filter(([k]) => k.startsWith(ws))
      .map(([k, role]) => ({
        userId: k.split(':')[1]!,
        email: null,
        role,
        createdAt: new Date(0).toISOString(),
      }));
  }
  async findUserIdByEmail() {
    return null;
  }
  async countOwners(ws: string) {
    return [...this.roles.entries()].filter(([k, r]) => k.startsWith(ws) && r === 'owner').length;
  }
  async upsertMember(ws: string, userId: string, role: Role) {
    const before = this.roles.get(`${ws}:${userId}`) ?? null;
    this.roles.set(`${ws}:${userId}`, role);
    return before;
  }
  async removeMember(ws: string, userId: string) {
    return this.roles.delete(`${ws}:${userId}`);
  }
  async audit(entry: unknown) {
    this.audits.push(entry);
  }
}

let app: INestApplication;
let sign: (sub: string, opts?: { issuer?: string; expired?: boolean }) => Promise<string>;
const membership = new FakeMembership();
const NEW_USER = '10000000-0000-4000-8000-000000000099';

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'ES256' };
  sign = (sub, opts = {}) =>
    new SignJWT({ email: `${sub}@example.test` })
      .setProtectedHeader({ alg: 'ES256', kid: 'test' })
      .setSubject(sub)
      .setIssuer(opts.issuer ?? `${SUPABASE_URL}/auth/v1`)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime(opts.expired ? Math.floor(Date.now() / 1000) - 60 : '1h')
      .sign(privateKey);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(
      loadEnv({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgres://user:pass@127.0.0.1:1/none',
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-real',
        WEB_ORIGIN: 'https://web.example.test',
      }),
    )
    .overrideProvider(JWT_KEYS)
    .useValue(createLocalJWKSet({ keys: [jwk] }))
    .overrideProvider(MembershipRepository)
    .useValue(membership)
    .overrideProvider(SupabaseAdmin)
    .useValue({ inviteByEmail: async () => NEW_USER })
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
});

afterAll(async () => {
  await app?.close();
});

const as = async (who: keyof typeof users) => `Bearer ${await sign(users[who])}`;

describe('вход', () => {
  it('/health открыт без входа', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
  });
  it('без токена — 401', async () => {
    await request(app.getHttpServer()).get('/me').expect(401);
  });
  it('чужой издатель и просроченный токен — 401', async () => {
    const foreign = await sign(users.owner, { issuer: 'https://evil.example/auth/v1' });
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${foreign}`)
      .expect(401);
    const expired = await sign(users.owner, { expired: true });
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);
  });
  it('/me возвращает только свои компании', async () => {
    const res = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', await as('viewer'))
      .expect(200);
    expect(res.body.workspaces).toEqual([expect.objectContaining({ id: WS_A, role: 'viewer' })]);
  });
});

describe('доступ к компании и роли', () => {
  it('без X-Workspace-Id — 400', async () => {
    await request(app.getHttpServer())
      .get('/members')
      .set('Authorization', await as('owner'))
      .expect(400);
  });
  it('участник другой компании не видит чужую — 403', async () => {
    await request(app.getHttpServer())
      .get('/members')
      .set('Authorization', await as('outsider'))
      .set('X-Workspace-Id', WS_A)
      .expect(403);
  });
  it.each(['marketer', 'sales', 'viewer'] as const)(
    '%s не управляет командой — 403',
    async (role) => {
      await request(app.getHttpServer())
        .get('/members')
        .set('Authorization', await as(role))
        .set('X-Workspace-Id', WS_A)
        .expect(403);
      await request(app.getHttpServer())
        .post('/members/invite')
        .set('Authorization', await as(role))
        .set('X-Workspace-Id', WS_A)
        .send({ email: 'new@example.test', role: 'viewer' })
        .expect(403);
    },
  );
  it('владелец видит команду своей компании', async () => {
    const res = await request(app.getHttpServer())
      .get('/members')
      .set('Authorization', await as('owner'))
      .set('X-Workspace-Id', WS_A)
      .expect(200);
    expect(res.body.members).toHaveLength(4);
  });
  it('владелец приглашает, запись попадает в журнал', async () => {
    await request(app.getHttpServer())
      .post('/members/invite')
      .set('Authorization', await as('owner'))
      .set('X-Workspace-Id', WS_A)
      .send({ email: 'new@example.test', role: 'marketer' })
      .expect(204);
    expect(await membership.findRole(NEW_USER, WS_A)).toBe('marketer');
    expect(membership.audits).toContainEqual(expect.objectContaining({ action: 'member.invite' }));
  });
  it('неверные данные приглашения — 400', async () => {
    await request(app.getHttpServer())
      .post('/members/invite')
      .set('Authorization', await as('owner'))
      .set('X-Workspace-Id', WS_A)
      .send({ email: 'не-почта', role: 'boss' })
      .expect(400);
  });
  it('последнего владельца нельзя понизить', async () => {
    await request(app.getHttpServer())
      .patch(`/members/${users.owner}`)
      .set('Authorization', await as('owner'))
      .set('X-Workspace-Id', WS_A)
      .send({ role: 'viewer' })
      .expect(409);
  });
});
