import type { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AllExceptionsFilter } from '../common/all-exceptions.filter';
import { APP_CONFIG, DATABASE, X_KITCHEN_PIN_HEADER } from '../common/tokens';
import { InMemoryDatabase, makeConfig, newItem, newOrder } from '../testing/fakes';
import { KitchenController } from './kitchen.controller';
import { KitchenPinGuard } from './kitchen-pin.guard';
import { KitchenService } from './kitchen.service';

/**
 * Task-canonical kitchen contract: /kitchen/orders, X-Kitchen-Pin, board-only
 * states ordered by created_at, and /kitchen/orders/:id/state. The legacy
 * /kitchen + KITCHEN_PIN aliases are covered in kitchen.e2e.spec.ts.
 */
describe('Kitchen API — canonical contract (/kitchen/orders, X-Kitchen-Pin)', () => {
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

  const pinned = (req: request.Test): request.Test =>
    req.set(X_KITCHEN_PIN_HEADER, makeConfig().kitchenPin);

  it('GET /kitchen/orders requires the X-Kitchen-Pin (403 without / wrong)', async () => {
    await request(app.getHttpServer()).get('/kitchen/orders').expect(403);
    await request(app.getHttpServer())
      .get('/kitchen/orders')
      .set(X_KITCHEN_PIN_HEADER, 'wrong')
      .expect(403);
    await pinned(request(app.getHttpServer()).get('/kitchen/orders')).expect(200);
  });

  it('GET /kitchen/orders shows only board states (entregado leaves the board)', async () => {
    await db.insertOrder(newOrder({ kitchen_state: 'nuevo' }), [newItem()]);
    await db.insertOrder(newOrder({ kitchen_state: 'en_preparacion' }), [newItem()]);
    await db.insertOrder(newOrder({ kitchen_state: 'listo' }), [newItem()]);
    await db.insertOrder(newOrder({ kitchen_state: 'entregado' }), [newItem()]);
    const res = await pinned(request(app.getHttpServer()).get('/kitchen/orders')).expect(200);
    expect(res.body).toHaveLength(3);
    expect(res.body.every((o: { kitchen_state: string }) => o.kitchen_state !== 'entregado')).toBe(
      true,
    );
  });

  it('GET /kitchen/orders is ordered by created_at ascending (oldest first)', async () => {
    // Inserted out of chronological order on purpose.
    await db.insertOrder(newOrder({ created_at: '2026-11-15T12:00:03.000Z' }), [newItem()]);
    await db.insertOrder(newOrder({ created_at: '2026-11-15T12:00:01.000Z' }), [newItem()]);
    await db.insertOrder(newOrder({ created_at: '2026-11-15T12:00:02.000Z' }), [newItem()]);
    const res = await pinned(request(app.getHttpServer()).get('/kitchen/orders')).expect(200);
    const times = res.body.map((o: { created_at: string }) => o.created_at);
    expect(times).toEqual([...times].sort());
  });

  it('GET /kitchen/orders?state= validates and filters explicitly', async () => {
    await db.insertOrder(newOrder({ kitchen_state: 'listo' }), [newItem()]);
    await pinned(request(app.getHttpServer()).get('/kitchen/orders?state=listo')).expect(200);
    await pinned(request(app.getHttpServer()).get('/kitchen/orders?state=bogus')).expect(400);
  });

  it('PATCH /kitchen/orders/:id/state advances a valid forward transition', async () => {
    const { order } = await db.insertOrder(newOrder({ kitchen_state: 'nuevo' }), [newItem()]);
    const res = await pinned(
      request(app.getHttpServer())
        .patch(`/kitchen/orders/${order.id}/state`)
        .send({ state: 'en_preparacion' }),
    ).expect(200);
    expect(res.body.kitchen_state).toBe('en_preparacion');
  });

  it('PATCH /kitchen/orders/:id/state rejects a backward/skipped transition (409)', async () => {
    const { order } = await db.insertOrder(newOrder({ kitchen_state: 'nuevo' }), [newItem()]);
    const res = await pinned(
      request(app.getHttpServer())
        .patch(`/kitchen/orders/${order.id}/state`)
        .send({ state: 'listo' }),
    ).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});
