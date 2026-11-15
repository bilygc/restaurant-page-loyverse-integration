import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DomainError } from './common/errors';
import { APP_CONFIG } from './common/tokens';
import type { AppConfig } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Keep the unparsed body available. Stripe signature verification (post-POC)
    // requires it; the Loyverse webhook is unsigned and uses parsed JSON. No
    // body parser may consume a signed webhook payload before verification.
    rawBody: true,
  });

  const config = app.get<AppConfig>(APP_CONFIG);
  app.enableShutdownHooks();
  // CORS restricted to the web app's origin.
  app.enableCors({ origin: config.webAppOrigin });
  // Render injects PORT; bind to 0.0.0.0 so the service is reachable.
  await app.listen(config.port, '0.0.0.0');
}

bootstrap().catch((err: unknown) => {
  const logger = new Logger('Bootstrap');
  // Fail fast at boot. Only DomainError messages are printed (they name
  // variables, never values); raw errors are reduced to a generic line so no
  // secret, connection string or stack trace is ever logged.
  if (err instanceof DomainError) {
    logger.error(`startup_failed [${err.code}] ${err.message}`);
  } else {
    logger.error('startup_failed: application could not start');
  }
  process.exit(1);
});
