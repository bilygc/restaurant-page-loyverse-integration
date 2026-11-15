import http from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AllExceptionsFilter } from '../common/all-exceptions.filter';
import { APP_CONFIG, DATABASE } from '../common/tokens';
import { InMemoryDatabase, makeConfig, newItem, newOrder } from '../testing/fakes';
import { KitchenController } from './kitchen.controller';
import { KitchenPinGuard } from './kitchen-pin.guard';
import { KitchenService } from './kitchen.service';

/** GET /kitchen/stream (optional SSE). Uses a real ephemeral port + raw HTTP so
 * the test can read the first event then destroy the connection (no open handles). */
describe('Kitchen SSE stream (/kitchen/stream)', () => {
  let app: INestApplication;
  let db: InMemoryDatabase;
  let port: number;

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
    await app.listen(0);
    const addr = app.getHttpServer().address();
    port = typeof addr === 'object' && addr ? addr.port : 0;
  });

  afterEach(async () => {
    await app.close();
  });

  const options = (headers: Record<string, string> = {}) => ({
    host: '127.0.0.1',
    port,
    path: '/kitchen/stream',
    headers,
  });

  const getOnce = (headers: Record<string, string>): Promise<{ status: number; body: string }> =>
    new Promise((resolve, reject) => {
      const req = http.get(options(headers), (res) => {
        res.setEncoding('utf8');
        let body = '';
        res.on('data', (chunk: string) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(2000, () => {
        req.destroy();
        reject(new Error('SSE request timeout'));
      });
    });

  const readFirstFrame = (headers: Record<string, string>): Promise<string> =>
    new Promise((resolve, reject) => {
      const req = http.get(options(headers), (res) => {
        res.setEncoding('utf8');
        let buf = '';
        res.on('data', (chunk: string) => {
          buf += chunk;
          if (buf.includes('\n\n')) {
            req.destroy();
            resolve(buf);
          }
        });
        res.on('error', () => {});
      });
      req.on('error', () => {}); // destroy() emits a benign request error
      req.setTimeout(2000, () => {
        req.destroy();
        reject(new Error('SSE frame timeout'));
      });
    });

  it('is PIN-guarded: a request without X-Kitchen-Pin is rejected (403)', async () => {
    const res = await getOnce({});
    expect(res.status).toBe(403);
    expect(res.body).toContain('FORBIDDEN');
  });

  it('streams the board as an initial SSE data frame', async () => {
    await db.insertOrder(newOrder({ kitchen_state: 'nuevo' }), [newItem()]);
    const frame = await readFirstFrame({ 'x-kitchen-pin': makeConfig().kitchenPin });
    expect(frame).toContain('data:');
    expect(frame).toContain('kitchen_state');
    expect(frame).toContain('nuevo');
  });
});
