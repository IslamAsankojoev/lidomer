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

  async listWorkspacesOf(userId: string): Promise<WorkspaceSummary[]> {
    return this.db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        timezone: workspaces.timezone,
        displayCurrency: workspaces.displayCurrency,
        role: members.role,
      })
      .from(members)
      .innerJoin(workspaces, eq(workspaces.id, members.workspaceId))
      .where(eq(members.userId, userId))
      .orderBy(workspaces.name);
  }

  async listMembers(workspaceId: string): Promise<Member[]> {
    const rows = await this.db
      .select({ userId: members.userId, email: emailOf, role: members.role, createdAt: members.createdAt })
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

  async audit(entry: AuditLogEntry): Promise<void> {
    await this.db.insert(auditLog).values(entry);
  }
}
