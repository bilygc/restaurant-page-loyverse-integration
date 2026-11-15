import { z } from 'zod';
import { kitchenStateSchema, orderOriginSchema, syncStatusSchema } from './enums';

/**
 * API contract DTOs. These Zod schemas are the single source of truth shared
 * by the API (validation pipe) and the frontend. No `class-validator` DTOs.
 *
 * Untrusted customer text (names / notes) is length-bounded here. There are
 * NO price fields in the create-order input: the server owns all prices.
 */

export const MAX_NOTE_LENGTH = 280;
export const MAX_NAME_LENGTH = 120;
export const MAX_ITEMS_PER_ORDER = 50;
export const MAX_QUANTITY = 999;

export const orderItemInputSchema = z
  .object({
    menu_item_id: z.string().min(1).max(MAX_NAME_LENGTH),
    quantity: z.number().int().positive().max(MAX_QUANTITY),
    line_note: z.string().max(MAX_NOTE_LENGTH).optional().nullable(),
  })
  .strict();

export const createOrderSchema = z
  .object({
    items: z.array(orderItemInputSchema).min(1).max(MAX_ITEMS_PER_ORDER),
    dining_option: z.string().max(MAX_NAME_LENGTH).optional().nullable(),
    note: z.string().max(MAX_NOTE_LENGTH).optional().nullable(),
  })
  .strict();
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;

export const patchKitchenStateSchema = z
  .object({
    state: kitchenStateSchema,
  })
  .strict();
export type PatchKitchenStateInput = z.infer<typeof patchKitchenStateSchema>;

export const kitchenQuerySchema = z
  .object({
    state: kitchenStateSchema.optional(),
  })
  .strict();
export type KitchenQuery = z.infer<typeof kitchenQuerySchema>;

// ---- Server-owned response shapes (include the recomputed integer total) ----

export const orderItemViewSchema = z.object({
  id: z.string(),
  menu_item_id: z.string().nullable(),
  variant_id: z.string().nullable(),
  item_name: z.string(),
  quantity: z.number().int().positive(),
  unit_price_centavos: z.number().int().min(0),
  line_note: z.string().nullable(),
});
export type OrderItemView = z.infer<typeof orderItemViewSchema>;

export const orderViewSchema = z.object({
  id: z.string(),
  origin: orderOriginSchema,
  kitchen_state: kitchenStateSchema,
  loyverse_receipt_number: z.string().nullable(),
  sync_status: syncStatusSchema,
  total_centavos: z.number().int().min(0),
  dining_option: z.string().nullable(),
  note: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  items: z.array(orderItemViewSchema),
});
export type OrderView = z.infer<typeof orderViewSchema>;

/** Kitchen board card. Same shape as an order view. */
export type KitchenOrderView = OrderView;
