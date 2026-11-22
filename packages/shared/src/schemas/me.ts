import { z } from 'zod';
import { roleSchema } from '../roles';

export const workspaceSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  timezone: z.string(),
  displayCurrency: z.string().length(3),
  role: roleSchema,
  /**
   * Публичная ссылка на логотип; null — логотипа нет, показываем первую букву названия.
   * default — пока api без логотипов (превью web против боевого api) не ломает вход.
   */
  logoUrl: z.url().nullable().default(null),
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

export const meResponseSchema = z.object({
  user: z.object({ id: z.uuid(), email: z.email().nullable() }),
  workspaces: z.array(workspaceSummarySchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/** Своя компания для пользователя без компаний: он становится её владельцем. */
export const createWorkspaceRequestSchema = z.object({
  name: z.string().trim().min(1, 'Введите название компании').max(80),
});
export type CreateWorkspaceRequest = z.infer<typeof createWorkspaceRequestSchema>;

export const memberSchema = z.object({
  userId: z.uuid(),
  email: z.email().nullable(),
  role: roleSchema,
  createdAt: z.string(),
});
export type Member = z.infer<typeof memberSchema>;

export const membersResponseSchema = z.object({ members: z.array(memberSchema) });
export type MembersResponse = z.infer<typeof membersResponseSchema>;

export const inviteMemberRequestSchema = z.object({
  email: z.email(),
  role: roleSchema,
});
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>;
/**
 * emailSent — Supabase отправил письмо-приглашение (почта новая). false — у человека уже есть вход:
 * Supabase приглашает только новые почты, его просто добавили в команду без письма.
 */
export const inviteMemberResponseSchema = z.object({ emailSent: z.boolean() });
export type InviteMemberResponse = z.infer<typeof inviteMemberResponseSchema>;

/** Логотип компании: файл в base64. Тип определяет api по содержимому, не по расширению. */
export const LOGO_MAX_BYTES = 512 * 1024;
export const uploadLogoRequestSchema = z.object({
  data: z.base64().max(Math.ceil((LOGO_MAX_BYTES * 4) / 3) + 4, 'Логотип больше 512 КБ'),
});
export type UploadLogoRequest = z.infer<typeof uploadLogoRequestSchema>;

export const apiErrorSchema = z.object({
  statusCode: z.number(),
  message: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
