import { Global, Module } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import type { Database as DbTypes } from '@restaurant/shared';
import type { AppConfig } from '../config/env';
import { APP_CONFIG, DATABASE, SUPABASE_CLIENT } from '../common/tokens';
import { SupabaseDatabase } from './supabase.database';

/**
 * Global database module. The real Supabase client is created from validated
 * config; tests override SUPABASE_CLIENT / DATABASE with fakes. Creating the
 * client is lazy (no connection at boot), so a down DB does not block startup.
 */
@Global()
@Module({
  providers: [
    {
      provide: SUPABASE_CLIENT,
      useFactory: (config: AppConfig) =>
        createClient<DbTypes>(config.supabaseUrl, config.supabaseServiceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        }),
      inject: [APP_CONFIG],
    },
    { provide: DATABASE, useClass: SupabaseDatabase },
  ],
  exports: [DATABASE, SUPABASE_CLIENT],
})
export class DatabaseModule {}
