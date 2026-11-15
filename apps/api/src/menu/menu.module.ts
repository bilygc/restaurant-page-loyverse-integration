import { Module } from '@nestjs/common';
import { MENU_PRICELIST } from '../common/tokens';
import { MenuController } from './menu.controller';
import { StaticMenuPricelist } from './menu-pricelist';
import { MenuService } from './menu.service';

@Module({
  controllers: [MenuController],
  providers: [MenuService, { provide: MENU_PRICELIST, useClass: StaticMenuPricelist }],
  exports: [MENU_PRICELIST],
})
export class MenuModule {}
