import { Controller, Get, Inject } from '@nestjs/common';
import type { MenuResponse } from '@restaurant/shared';
import { MenuService } from './menu.service';

@Controller('menu')
export class MenuController {
  constructor(@Inject(MenuService) private readonly menu: MenuService) {}

  /** GET /menu — server-owned pricelist with integer-centavos prices. */
  @Get()
  list(): MenuResponse {
    return this.menu.list();
  }
}
