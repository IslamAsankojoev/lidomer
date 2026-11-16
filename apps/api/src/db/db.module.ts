import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDb, type Db } from '@lidomer/db';
import { ENV, type Env } from '../config/env';

export const DB = Symbol('DB');
const DB_CLIENT = Symbol('DB_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: DB_CLIENT,
      inject: [ENV],
      useFactory: (env: Env) => createDb(env.DATABASE_URL),
    },
    {
      provide: DB,
      inject: [DB_CLIENT],
      useFactory: (c: ReturnType<typeof createDb>): Db => c.db,
    },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB_CLIENT) private readonly conn: ReturnType<typeof createDb>) {}

  async onApplicationShutdown(): Promise<void> {
    await this.conn.client.end({ timeout: 5 });
  }
}
