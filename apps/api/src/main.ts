import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Stripe webhook signature verification requires the *unparsed* request
    // body. `rawBody: true` exposes it as `req.rawBody`; no body parser may
    // consume the webhook payload before verification. This is scaffolding
    // config only — webhook handling/verification is intentionally NOT
    // implemented here. NestJS uses Express by default (plan.md §2.B); no
    // Fastify adapter.
    rawBody: true,
  });

  // Render injects PORT; bind to 0.0.0.0 so the service is reachable.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

void bootstrap();
