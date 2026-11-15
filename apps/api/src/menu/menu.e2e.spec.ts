import type { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { menuResponseSchema } from '@restaurant/shared';
import { AllExceptionsFilter } from '../common/all-exceptions.filter';
import { MENU_PRICELIST } from '../common/tokens';
import { MenuController } from './menu.controller';
import { StaticMenuPricelist } from './menu-pricelist';
import { MenuService } from './menu.service';

describe('GET /menu (e2e: server-owned price catalog)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MenuController],
      providers: [
        MenuService,
        { provide: MENU_PRICELIST, useClass: StaticMenuPricelist },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the menu with integer-centavos prices and no client price', async () => {
    const res = await request(app.getHttpServer()).get('/menu').expect(200);
    expect(menuResponseSchema.safeParse(res.body).success).toBe(true);
    expect(res.body.items.length).toBe(3);
    for (const item of res.body.items) {
      expect(Number.isInteger(item.unit_price_centavos)).toBe(true);
    }
    const pastor = res.body.items.find(
      (i: { menu_item_id: string }) => i.menu_item_id === 'taco-pastor',
    );
    expect(pastor.unit_price_centavos).toBe(3500); // from server pricelist, not the request
  });

  it('ignores a body that tries to inject a price (GET has no price input)', async () => {
    const res = await request(app.getHttpServer())
      .get('/menu')
      .send({ items: [{ menu_item_id: 'taco-pastor', unit_price_centavos: 1 }] })
      .expect(200);
    const pastor = res.body.items.find(
      (i: { menu_item_id: string }) => i.menu_item_id === 'taco-pastor',
    );
    expect(pastor.unit_price_centavos).toBe(3500);
  });
});
