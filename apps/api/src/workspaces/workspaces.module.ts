import { Module } from '@nestjs/common';
import { MembershipRepository } from './membership.repository';
import { SupabaseAdmin } from './supabase-admin';
import { WorkspaceGuard } from './workspace.guard';
import { WorkspacesController } from './workspaces.controller';

@Module({
  controllers: [WorkspacesController],
  providers: [MembershipRepository, SupabaseAdmin, WorkspaceGuard],
  exports: [MembershipRepository, WorkspaceGuard],
})
export class WorkspacesModule {}
