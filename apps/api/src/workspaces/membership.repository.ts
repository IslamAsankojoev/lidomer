import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { auditLog, type Db, members, workspaces, type AuditLogEntry } from '@lidomer/db';
import type { Member, Role, WorkspaceSummary } from '@lidomer/shared';
import { DB } from '../db/db.module';

const emailOf = sql<string | null>`(select email from auth.users u where u.id = ${members.userId})`;

/** Доступ к компаниям и участникам. Все запросы ограничены workspace_id. */
@Injectable()
export class MembershipRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async findRole(userId: string, workspaceId: string): Promise<Role | null> {
    const [row] = await this.db
      .select({ role: members.role })
      .from(members)
      .where(and(eq(members.userId, userId), eq(members.workspaceId, workspaceId)))
      .limit(1);
    return row?.role ?? null;
  }

  /** Компании пользователя; `logoPath` превращает в ссылку контроллер. */
  async listWorkspacesOf(
    userId: string,
  ): Promise<(Omit<WorkspaceSummary, 'logoUrl'> & { logoPath: string | null })[]> {
    return this.db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        timezone: workspaces.timezone,
        displayCurrency: workspaces.displayCurrency,
        role: members.role,
        logoPath: workspaces.logoPath,
      })
      .from(members)
      .innerJoin(workspaces, eq(workspaces.id, members.workspaceId))
      .where(eq(members.userId, userId))
      .orderBy(workspaces.name);
  }

  /** Email участника — только пока он в команде компании; иначе null. */
  async memberEmail(workspaceId: string, userId: string): Promise<string | null> {
    const rows = await this.db.execute<{ email: string | null }>(sql`
      select u.email from auth.users u
      join members m on m.user_id = u.id and m.workspace_id = ${workspaceId}
      where u.id = ${userId} limit 1`);
    return rows[0]?.email ?? null;
  }

  async listMembers(workspaceId: string): Promise<Member[]> {
    const rows = await this.db
      .select({
        userId: members.userId,
        email: emailOf,
        role: members.role,
        createdAt: members.createdAt,
      })
      .from(members)
      .where(eq(members.workspaceId, workspaceId))
      .orderBy(members.createdAt);
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  async findUserIdByEmail(email: string): Promise<string | null> {
    const rows = await this.db.execute<{ id: string }>(
      sql`select id from auth.users where lower(email) = lower(${email}) limit 1`,
    );
    return rows[0]?.id ?? null;
  }

  async countOwners(workspaceId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(members)
      .where(and(eq(members.workspaceId, workspaceId), eq(members.role, 'owner')));
    return row?.n ?? 0;
  }

  /** Добавить участника или сменить роль. Возвращает прежнюю роль (null — не был участником). */
  async upsertMember(workspaceId: string, userId: string, role: Role): Promise<Role | null> {
    const before = await this.findRole(userId, workspaceId);
    await this.db
      .insert(members)
      .values({ workspaceId, userId, role })
      .onConflictDoUpdate({ target: [members.workspaceId, members.userId], set: { role } });
    return before;
  }

  async removeMember(workspaceId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .delete(members)
      .where(and(eq(members.workspaceId, workspaceId), eq(members.userId, userId)))
      .returning({ id: members.id });
    return rows.length > 0;
  }

  async logoPath(workspaceId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ logoPath: workspaces.logoPath })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    return row?.logoPath ?? null;
  }

  async setLogoPath(workspaceId: string, logoPath: string | null): Promise<void> {
    await this.db.update(workspaces).set({ logoPath }).where(eq(workspaces.id, workspaceId));
  }

  async audit(entry: AuditLogEntry): Promise<void> {
    await this.db.insert(auditLog).values(entry);
  }
}
