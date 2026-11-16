import type { Request } from 'express';
import type { Role } from '@lidomer/shared';

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface WorkspaceContext {
  workspaceId: string;
  role: Role;
}

export interface AppRequest extends Request {
  user?: AuthUser;
  workspace?: WorkspaceContext;
}
