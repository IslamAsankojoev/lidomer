import { z } from 'zod';
import { roleSchema } from '../roles';

export const workspaceSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  timezone: z.string(),
  displayCurrency: z.string().length(3),
  role: roleSchema,
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

export const meResponseSchema = z.object({
  user: z.object({ id: z.uuid(), email: z.email().nullable() }),
  workspaces: z.array(workspaceSummarySchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

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

export const apiErrorSchema = z.object({
  statusCode: z.number(),
  message: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
