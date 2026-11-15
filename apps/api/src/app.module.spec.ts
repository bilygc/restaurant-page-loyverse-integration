import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import {
  APP_CONFIG,
  DATABASE,
  LOYVERSE_HTTP,
  PAYMENT_GATEWAY,
  POS_GATEWAY,
  SUPABASE_CLIENT,
} from './common/tokens';
import { IngestionService } from './loyverse/ingestion.service';
import { KitchenService } from './kitchen/kitchen.service';
import { NotificationsService } from './notifications/notifications.service';
import { OrdersService } from './orders/orders.service';
import { OutboxWorker } from './outbox/outbox.worker';
import {
  FakeHttpClient,
  FakePaymentGateway,
  FakePosGateway,
  InMemoryDatabase,
  makeConfig,
} from './testing/fakes';

/**
 * DI wiring / bootstrap smoke (the "Nest can't resolve dependencies" guard).
 * Builds the FULL AppModule with every external boundary faked, so a missing
 * provider/import fails here at boot rather than at the first request.
 */
describe('AppModule composition', () => {
  it('resolves all providers and serves /health (no live services)', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(makeConfig())
      .overrideProvider(DATABASE)
      .useValue(new InMemoryDatabase())
      .overrideProvider(SUPABASE_CLIENT)
      .useValue({})
      .overrideProvider(LOYVERSE_HTTP)
      .useValue(new FakeHttpClient())
      .overrideProvider(POS_GATEWAY)
      .useValue(new FakePosGateway())
      .overrideProvider(PAYMENT_GATEWAY)
      .useValue(new FakePaymentGateway())
      .compile();

    expect(moduleRef.get(OrdersService)).toBeDefined();
    expect(moduleRef.get(KitchenService)).toBeDefined();
    expect(moduleRef.get(OutboxWorker)).toBeDefined();
    expect(moduleRef.get(IngestionService)).toBeDefined();
    // NotificationsModule (Resend) is deliberately OUT of the POC runtime.
    expect(() => moduleRef.get(NotificationsService)).toThrow();

    const app = moduleRef.createNestApplication();
    await app.init();
    // main.ts reads config through app.get(APP_CONFIG) before listen().
    expect(app.get(APP_CONFIG)).toBeDefined();
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
    await app.close();
  });
});
