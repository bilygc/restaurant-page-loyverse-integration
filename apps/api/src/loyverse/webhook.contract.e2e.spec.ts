import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESTAURANT_WEB_SOURCE } from '@restaurant/shared';
import { AllExceptionsFilter } from '../common/all-exceptions.filter';
import { FakeClock } from '../common/clock';
import { APP_CONFIG, CLOCK, DATABASE, POS_GATEWAY, X_WEBHOOK_TOKEN_HEADER } from '../common/tokens';
import type { AppConfig } from '../config/env';
import { FakePosGateway, InMemoryDatabase, makeConfig, makeReceipt } from '../testing/fakes';
import { IngestionService } from './ingestion.service';
import { LoyverseWebhookController } from './loyverse.controller';

const TOKEN = 'unguessable-url-token';

/**
 * Task-canonical webhook contract: POST /loyverse/webhooks/receipts, token via
 * ?token= OR X-Webhook-Token (timingSafeEqual), raw body logged for H3 evidence
 * in development only, canonical GET re-fetch, echo/dedup. The legacy
 * /loyverse/webhook aliases are covered in webhook.e2e.spec.ts.
 */
describe('Loyverse webhook — canonical contract (/loyverse/webhooks/receipts)', () => {
  let app: INestApplication | undefined;
  let db: InMemoryDatabase;
  let pos: FakePosGateway;

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
    vi.restoreAllMocks();
  });

  const createApp = async (config: AppConfig = makeConfig({ loyverseWebhookToken: TOKEN })) => {
    db = new InMemoryDatabase();
    pos = new FakePosGateway();
    const moduleRef = await Test.createTestingModule({
      controllers: [LoyverseWebhookController],
      providers: [
        IngestionService,
        { provide: DATABASE, useValue: db },
        { provide: POS_GATEWAY, useValue: pos },
        { provide: CLOCK, useValue: new FakeClock(Date.parse('2026-11-15T12:00:00.000Z')) },
        { provide: APP_CONFIG, useValue: config },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    return app;
  };

  it('accepts ?token= and fetches the canonical receipt (body never trusted)', async () => {
    const a = await createApp();
    pos.getReceiptResult = makeReceipt({ receiptNumber: 'R-1' });
    const res = await request(a.getHttpServer())
      .post(`/loyverse/webhooks/receipts?token=${TOKEN}`)
      .send({ receipt_number: 'R-1', line_items: [{ price: 0.01 }] })
      .expect(200);
    expect(res.body).toEqual({ received: true });
    expect(pos.getCalls).toEqual(['R-1']);
    expect([...db.orders.values()][0].total_centavos).toBe(8400); // canonical, not body
  });

  it('accepts the X-Webhook-Token header (timingSafeEqual)', async () => {
    const a = await createApp();
    pos.getReceiptResult = makeReceipt({ receiptNumber: 'R-2' });
    await request(a.getHttpServer())
      .post('/loyverse/webhooks/receipts')
      .set(X_WEBHOOK_TOKEN_HEADER, TOKEN)
      .send({ receipt_number: 'R-2' })
      .expect(200);
    expect(db.orders.size).toBe(1);
  });

  it('hides the endpoint on a missing / mismatched token (404, no ingest)', async () => {
    const a = await createApp();
    await request(a.getHttpServer())
      .post('/loyverse/webhooks/receipts?token=wrong')
      .send({ receipt_number: 'R-1' })
      .expect(404);
    await request(a.getHttpServer())
      .post('/loyverse/webhooks/receipts')
      .send({ receipt_number: 'R-1' })
      .expect(404);
    expect(pos.getCalls).toHaveLength(0);
    expect(db.orders.size).toBe(0);
  });

  it('ignores our own echo (source=restaurant-web) — H8', async () => {
    const a = await createApp();
    pos.getReceiptResult = makeReceipt({ source: RESTAURANT_WEB_SOURCE });
    await request(a.getHttpServer())
      .post('/loyverse/webhooks/receipts')
      .set(X_WEBHOOK_TOKEN_HEADER, TOKEN)
      .send({ receipt_number: 'R-1' })
      .expect(200);
    expect(db.orders.size).toBe(0);
  });

  it('logs the RAW webhook body for H3 evidence in development only', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const a = await createApp(makeConfig({ nodeEnv: 'development', loyverseWebhookToken: TOKEN }));
    await request(a.getHttpServer())
      .post(`/loyverse/webhooks/receipts?token=${TOKEN}`)
      .send({ receipt_number: 'R-9', undocumented_field: 'capture-me' })
      .expect(200);
    const evidence = logSpy.mock.calls.some((call) => String(call[0]).includes('POC_EVIDENCE'));
    const hasRaw = logSpy.mock.calls.some((call) => String(call[0]).includes('undocumented_field'));
    expect(evidence).toBe(true);
    expect(hasRaw).toBe(true);
  });

  it('NEVER logs the raw body (PII/secret risk) in production', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const a = await createApp(makeConfig({ nodeEnv: 'production', loyverseWebhookToken: TOKEN }));
    await request(a.getHttpServer())
      .post(`/loyverse/webhooks/receipts?token=${TOKEN}`)
      .send({ receipt_number: 'R-9', customer_email: 'pii@example.com' })
      .expect(200);
    const leaked = logSpy.mock.calls.some((call) => String(call[0]).includes('pii@example.com'));
    expect(leaked).toBe(false);
  });
});
