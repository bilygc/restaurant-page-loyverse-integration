import { z } from 'zod';

/**
 * GET /menu response contract. The menu is fully SERVER-OWNED: there is no
 * price field in any request, and every `unit_price_centavos` is an integer
 * number of centavos coming from the server pricelist (never from the client).
 * The frontend builds its cart/price display from this shape only.
 */
export const menuItemViewSchema = z.object({
  menu_item_id: z.string().min(1),
  item_name: z.string().min(1),
  unit_price_centavos: z.number().int().min(0),
});
export type MenuItemView = z.infer<typeof menuItemViewSchema>;

export const menuResponseSchema = z.object({
  items: z.array(menuItemViewSchema),
});
export type MenuResponse = z.infer<typeof menuResponseSchema>;
