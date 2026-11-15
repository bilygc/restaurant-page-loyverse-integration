import {
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  centavosToDecimalString,
  computeTotalCentavos,
  decimalToCentavos,
} from '@restaurant/shared';
import { PosGatewayError } from '../common/errors';
import { boundedTextOrNull, sanitizeText } from '../common/util';
import type {
  CreateReceiptInput,
  NormalizedLineItem,
  NormalizedReceipt,
} from './pos-gateway.interface';

export interface ReceiptCreatePayload {
  store_id: string;
  /** Writable reference we set to our own order id (H1 / reconciliation). */
  order: string;
  source: string;
  note: string;
  line_items: Array<{ variant_id: string; quantity: number }>;
  /** A single payment (payment_type_id + amount). */
  payments: Array<{ payment_type_id: string; amount: string }>;
}

export const MAX_RECEIPT_NOTE_LENGTH = 480;

/**
 * `dining_option` is NOT writable on Loyverse receipts, so we carry it in the
 * writable `note` field (workaround for H5). Customer notes are untrusted and
 * always sanitized / length-bounded here.
 */
export function buildDiningOptionNote(
  diningOption: string | null | undefined,
  note: string | null | undefined,
): string {
  const parts: string[] = [];
  const dining = sanitizeText(diningOption, MAX_NAME_LENGTH);
  // Bracketed tag so the kitchen/H5 inspection can spot the service type in the
  // writable note (dining_option itself is response-only on Loyverse).
  if (dining) parts.push(`[dining_option: ${dining}]`);
  const customer = sanitizeText(note, MAX_NOTE_LENGTH);
  if (customer) parts.push(customer);
  return parts.join(' | ').slice(0, MAX_RECEIPT_NOTE_LENGTH);
}

/** Build the POST /receipts body. Prices stay on Loyverse; we only send variants. */
export function buildReceiptCreatePayload(input: CreateReceiptInput): ReceiptCreatePayload {
  return {
    store_id: input.storeId,
    order: input.orderId,
    source: input.source,
    note: buildDiningOptionNote(input.diningOption, input.note),
    line_items: input.lineItems.map((line) => ({
      variant_id: line.variantId,
      quantity: line.quantity,
    })),
    payments: [
      {
        payment_type_id: input.paymentTypeId,
        amount: centavosToDecimalString(input.totalCentavos),
      },
    ],
  };
}

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const pick = (record: Record<string, unknown>, ...keys: string[]): string | null => {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value !== null) return value;
  }
  return null;
};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * Normalize a raw Loyverse receipt (from GET) into our canonical shape.
 * Defensive against malformed / partial payloads: missing line items yield an
 * empty list and a 0 total; only a missing receipt_number is fatal (it is the
 * dedup key). External decimal prices are converted through the single money
 * rounding helper. Never throws a raw error.
 */
export function normalizeReceipt(raw: unknown): NormalizedReceipt {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PosGatewayError('Receipt payload is not an object', 'invalid_request');
  }
  const record = raw as Record<string, unknown>;
  const receiptNumber = pick(record, 'receipt_number', 'number', 'receiptNumber', 'id');
  if (!receiptNumber) {
    throw new PosGatewayError('Receipt is missing receipt_number', 'invalid_request');
  }

  const rawLines = asArray(record['line_items'] ?? record['lineItems']);
  const lineItems: NormalizedLineItem[] = [];
  for (const entry of rawLines) {
    if (!entry || typeof entry !== 'object') continue;
    const line = entry as Record<string, unknown>;
    const quantityRaw = line['quantity'] ?? line['qty'];
    const quantity =
      typeof quantityRaw === 'number' && Number.isInteger(quantityRaw) && quantityRaw > 0
        ? quantityRaw
        : 1;
    const priceRaw = line['price'] ?? line['unit_price'] ?? line['total_price'];
    let unitPriceCentavos = 0;
    try {
      if (priceRaw !== undefined && priceRaw !== null) {
        unitPriceCentavos = Math.max(0, decimalToCentavos(String(priceRaw)));
      }
    } catch {
      unitPriceCentavos = 0;
    }
    lineItems.push({
      variantId: pick(line, 'variant_id', 'variantId'),
      itemName: boundedTextOrNull(pick(line, 'item_name', 'name', 'variant_name'), MAX_NAME_LENGTH),
      quantity,
      unitPriceCentavos,
      lineNote: boundedTextOrNull(pick(line, 'note', 'line_note'), MAX_NOTE_LENGTH),
    });
  }

  const totalCentavos = computeTotalCentavos(
    lineItems.map((line) => ({
      quantity: line.quantity,
      unitPriceCentavos: line.unitPriceCentavos,
    })),
  );

  return {
    receiptNumber,
    source: pick(record, 'source'),
    order: pick(record, 'order', 'order_id'),
    createdAt: pick(record, 'created_at', 'createdAt'),
    lineItems,
    totalCentavos,
  };
}
