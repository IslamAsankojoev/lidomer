/**
 * Сид для разработки: одна компания в поясе Asia/Bishkek.
 * Если задан SEED_OWNER_EMAIL и такой пользователь уже есть в Supabase Auth — делаем его владельцем.
 * Пользователя создаёт человек: Supabase → Authentication → Add user → Send invitation.
 */
import { eq, sql } from 'drizzle-orm';
import { createDb } from './client';
import { loadRootEnv } from './env';
import { members, workspaces } from './schema';

loadRootEnv();

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Нет DATABASE_URL_DIRECT в .env.local');
  const { db, client } = createDb(url, { max: 1 });
  try {
    const name = process.env.SEED_WORKSPACE_NAME ?? 'Моя компания';
    let [ws] = await db.select().from(workspaces).where(eq(workspaces.name, name)).limit(1);
    if (!ws) {
      [ws] = await db
        .insert(workspaces)
        .values({ name, timezone: 'Asia/Bishkek', displayCurrency: 'USD' })
        .returning();
      console.warn(`Создана компания «${name}» (${ws!.id})`);
    } else {
      console.warn(`Компания «${name}» уже есть (${ws.id})`);
    }

    const email = process.env.SEED_OWNER_EMAIL;
    if (!email) return;
    const rows = await db.execute<{ id: string }>(
      sql`select id from auth.users where lower(email) = lower(${email}) limit 1`,
    );
    const user = rows[0];
    if (!user) {
      console.warn(
        `Пользователь ${email} не найден в Supabase Auth. Пригласите его (Authentication → Add user → Send invitation) и запустите сид ещё раз.`,
      );
      return;
    }
    await db
      .insert(members)
      .values({ workspaceId: ws!.id, userId: user.id, role: 'owner' })
      .onConflictDoUpdate({
        target: [members.workspaceId, members.userId],
        set: { role: 'owner' },
      });
    console.warn(`${email} — владелец компании «${name}»`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
