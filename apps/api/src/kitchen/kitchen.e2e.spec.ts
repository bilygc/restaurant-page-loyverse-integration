import type { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AllExceptionsFilter } from '../common/all-exceptions.filter';
import { APP_CONFIG, DATABASE, KITCHEN_PIN_HEADER } from '../common/tokens';
import { InMemoryDatabase, makeConfig, newItem, newOrder } from '../testing/fakes';
import { KitchenController } from './kitchen.controller';
import { KitchenPinGuard } from './kitchen-pin.guard';
import { KitchenService } from './kitchen.service';

describe('Kitchen API (e2e: PIN guard, state machine, validation, filter)', () => {
  let app: INestApplication;
  let db: InMemoryDatabase;

  beforeEach(async () => {
    db = new InMemoryDatabase();
    const moduleRef = await Test.createTestingModule({
      controllers: [KitchenController],
      providers: [
        KitchenService,
        KitchenPinGuard,
        { provide: DATABASE, useValue: db },
        { provide: APP_CONFIG, useValue: makeConfig() },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const withPin = (req: request.Test): request.Test => req.set(KITCHEN_PIN_HEADER, '1234');

  it('rejects a missing or wrong PIN with 403 (no PII / stack leak)', async () => {
    const noPin = await request(app.getHttpServer()).get('/kitchen').expect(403);
    expect(noPin.body.error.code).toBe('FORBIDDEN');
    const badPin = await withPin(request(app.getHttpServer()).get('/kitchen')).expect(200);
    expect(Array.isArray(badPin.body)).toBe(true);
    const wrong = await request(app.getHttpServer())
      .get('/kitchen')
      .set(KITCHEN_PIN_HEADER, '9999')
      .expect(403);
    expect(wrong.body.error.code).toBe('FORBIDDEN');
    expect(JSON.stringify(wrong.body)).not.toContain('kitchenPin');
    expect(JSON.stringify(wrong.body)).not.toContain('stack');
  });

  it('GET /kitchen returns orders with server-recomputed totals', async () => {
    await db.insertOrder(newOrder({ total_centavos: 1 }), [
      newItem({ quantity: 2, unit_price_centavos: 7500 }),
    ]);
    const res = await withPin(request(app.getHttpServer()).get('/kitchen')).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].total_centavos).toBe(15000);
    expect(res.body[0].origin).toBe('web');
  });

  it('GET /kitchen?state= filters and validates the query', async () => {
    await db.insertOrder(newOrder({ kitchen_state: 'listo' }), [newItem()]);
    const ok = await withPin(request(app.getHttpServer()).get('/kitchen?state=listo')).expect(200);
    expect(ok.body).toHaveLength(1);
    const bad = await withPin(request(app.getHttpServer()).get('/kitchen?state=bogus')).expect(400);
    expect(bad.body.error.code).toBe('VALIDATION');
  });

  it('PATCH advances a valid transition', async () => {
    const { order } = await db.insertOrder(newOrder({ kitchen_state: 'nuevo' }), [newItem()]);
    const res = await withPin(
      request(app.getHttpServer())
        .patch(`/orders/${order.id}/kitchen-state`)
        .send({ state: 'en_preparacion' }),
    ).expect(200);
    expect(res.body.kitchen_state).toBe('en_preparacion');
  });

  it('PATCH rejects an invalid transition with 409', async () => {
    const { order } = await db.insertOrder(newOrder({ kitchen_state: 'nuevo' }), [newItem()]);
    const res = await withPin(
      request(app.getHttpServer())
        .patch(`/orders/${order.id}/kitchen-state`)
        .send({ state: 'listo' }),
    ).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('PATCH validates the body (unknown state / missing field) with 400', async () => {
    const { order } = await db.insertOrder(newOrder(), [newItem()]);
    await withPin(
      request(app.getHttpServer())
        .patch(`/orders/${order.id}/kitchen-state`)
        .send({ state: 'cancelado' }),
    ).expect(400);
    await withPin(
      request(app.getHttpServer()).patch(`/orders/${order.id}/kitchen-state`).send({}),
    ).expect(400);
  });

  it('PATCH unknown order returns 404', async () => {
    const res = await withPin(
      request(app.getHttpServer())
        .patch('/orders/does-not-exist/kitchen-state')
        .send({ state: 'en_preparacion' }),
    ).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
