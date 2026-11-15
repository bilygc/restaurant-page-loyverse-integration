import { Inject, Injectable } from '@nestjs/common';
import type { MenuResponse } from '@restaurant/shared';
import { MENU_PRICELIST } from '../common/tokens';
import type { MenuPricelist } from './menu-pricelist';

/**
 * Serves the server-owned price catalog. There is NO price input: prices come
 * only from MENU_PRICELIST (integer centavos), so a client can never influence
 * what it is charged. This is the "server owns prices" invariant.
 */
@Injectable()
export class MenuService {
  constructor(@Inject(MENU_PRICELIST) private readonly pricelist: MenuPricelist) {}

  list(): MenuResponse {
    return {
      items: this.pricelist.all().map((price) => ({
        menu_item_id: price.menuItemId,
        item_name: price.itemName,
        unit_price_centavos: price.unitPriceCentavos,
      })),
    };
  }
}
