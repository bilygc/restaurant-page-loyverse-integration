import type { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RESTAURANT_WEB_SOURCE } from '@restaurant/shared';
import { AllExceptionsFilter } from '../common/all-exceptions.filter';
import { FakeClock } from '../common/clock';
import { APP_CONFIG, CLOCK, DATABASE, POS_GATEWAY } from '../common/tokens';
import { FakePosGateway, InMemoryDatabase, makeConfig, makeReceipt } from '../testing/fakes';
import { IngestionService } from './ingestion.service';
import { LoyverseWebhookController } from './loyverse.controller';

const TOKEN = 'unguessable-url-token';

describe('Loyverse receipts.update webhook (e2e: unguessable URL token)', () => {
  let app: INestApplication;
  let db: InMemoryDatabase;
  let pos: FakePosGateway;

  beforeEach(async () => {
    db = new InMemoryDatabase();
    pos = new FakePosGateway();
    const moduleRef = await Test.createTestingModule({
      controllers: [LoyverseWebhookController],
      providers: [
        IngestionService,
        { provide: DATABASE, useValue: db },
        { provide: POS_GATEWAY, useValue: pos },
        { provide: CLOCK, useValue: new FakeClock(Date.parse('2026-11-15T12:00:00.000Z')) },
        { provide: APP_CONFIG, useValue: makeConfig({ loyverseWebhookToken: TOKEN }) },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('hides the endpoint behind the unguessable URL token (404 on mismatch)', async () => {
    await request(app.getHttpServer())
      .post('/loyverse/webhook/wrong-token')
      .send({ receipt_number: 'R-1' })
      .expect(404);
    expect(db.orders.size).toBe(0);
    expect(pos.getCalls).toHaveLength(0);
  });

  it('accepts the ADR-specified ?token= query param and fetches canonical receipt', async () => {
    pos.getReceiptResult = makeReceipt({ receiptNumber: 'R-1' });
    const res = await request(app.getHttpServer())
      .post(`/loyverse/webhook?token=${TOKEN}`)
      .send({ receipt_number: 'R-1' })
      .expect(200);
    expect(res.body).toEqual({ received: true });
    expect(pos.getCalls).toEqual(['R-1']);
    expect(db.orders.size).toBe(1);
    expect([...db.orders.values()][0].origin).toBe('pos');
  });

  it('also accepts a path token form (flexibility)', async () => {
    pos.getReceiptResult = makeReceipt({ receiptNumber: 'R-2' });
    await request(app.getHttpServer())
      .post(`/loyverse/webhook/${TOKEN}`)
      .send({ receipt_number: 'R-2' })
      .expect(200);
    expect(db.orders.size).toBe(1);
  });

  it('ignores our own echo (source=restaurant-web) — H8, no duplicate', async () => {
    pos.getReceiptResult = makeReceipt({
      receiptNumber: 'R-1',
      source: RESTAURANT_WEB_SOURCE,
    });
    await request(app.getHttpServer())
      .post(`/loyverse/webhook/${TOKEN}`)
      .send({ receipt_number: 'R-1' })
      .expect(200);
    expect(db.orders.size).toBe(0);
  });

  it('tolerates a malformed / partial body without failing', async () => {
    await request(app.getHttpServer())
      .post(`/loyverse/webhook/${TOKEN}`)
      .send({ nonsense: true })
      .expect(200);
    expect(pos.getCalls).toHaveLength(0);
    expect(db.orders.size).toBe(0);
  });

  it('does not leak raw errors when the canonical fetch fails', async () => {
    pos.throwOn.get = new Error('ECONNREFUSED api.loyverse.com');
    const res = await request(app.getHttpServer())
      .post(`/loyverse/webhook/${TOKEN}`)
      .send({ receipt_number: 'R-1' })
      .expect(200);
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
    expect(db.orders.size).toBe(0);
  });
});
