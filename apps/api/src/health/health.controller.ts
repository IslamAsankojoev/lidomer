import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@lidomer/shared';
import { Public } from '../auth/decorators';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  get(): HealthResponse {
    return {
      status: 'ok',
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
      time: new Date().toISOString(),
    };
  }
}
