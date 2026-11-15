import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_CONFIG } from '../common/tokens';
import { parseAppConfig } from './env';

/**
 * Global config module. The APP_CONFIG factory runs `parseAppConfig` at boot,
 * so a missing variable or a mock payment in production fails fast before the
 * server accepts any request. Tests override APP_CONFIG with a fake.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'apps/api/.env'],
    }),
  ],
  providers: [{ provide: APP_CONFIG, useFactory: () => parseAppConfig(process.env) }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
