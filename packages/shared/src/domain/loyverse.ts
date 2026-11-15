/**
 * Pure helpers for Loyverse receipt ingestion / echo suppression (H8).
 * The webhook body is UNTRUSTED (unsigned): it is only a trigger. We never use
 * its contents as data — we use it to find a receipt number, then fetch the
 * canonical receipt via GET /receipts/{number}.
 */

/** Value we write into the Loyverse receipt `source` field for our own orders. */
export const RESTAURANT_WEB_SOURCE = 'restaurant-web';

export const MAX_RECEIPT_CANDIDATES = 25;
const RECEIPT_NUMBER_RE = /^[A-Za-z0-9_-]{1,64}$/;
const RECEIPT_KEYS = new Set(['receipt_number', 'receiptNumber']);

export interface EchoCheckInput {
  source?: string | null;
  orderId?: string | null;
  /** Whether `orderId` matches an existing web order in our DB. */
  webOrderExists: boolean;
}

/**
 * True when a receipt must be ignored because it is an echo of an order we
 * created ourselves (so it never appears twice in the kitchen — H8):
 *  - we wrote source=restaurant-web, or
 *  - the writable `order` field points at one of our web orders.
 */
export function isEchoReceipt(input: EchoCheckInput): boolean {
  if (input.source === RESTAURANT_WEB_SOURCE) return true;
  if (input.orderId && input.webOrderExists) return true;
  return false;
}

/**
 * Extract candidate receipt numbers from an untrusted webhook payload.
 * Bounded (depth / key count / result count) and defensive against malformed,
 * partial or hostile input. Returns de-duplicated, syntax-checked strings.
 */
export function extractReceiptNumbers(payload: unknown): string[] {
  const results: string[] = [];
  const seen = new Set<string>();

  const add = (value: unknown): void => {
    if (
      typeof value === 'string' &&
      RECEIPT_NUMBER_RE.test(value) &&
      !seen.has(value) &&
      results.length < MAX_RECEIPT_CANDIDATES
    ) {
      seen.add(value);
      results.push(value);
    }
  };

  const walk = (node: unknown, depth: number): void => {
    if (
      node === null ||
      node === undefined ||
      depth > 6 ||
      results.length >= MAX_RECEIPT_CANDIDATES
    ) {
      return;
    }
    if (Array.isArray(node)) {
      for (const element of node) {
        if (results.length >= MAX_RECEIPT_CANDIDATES) break;
        walk(element, depth + 1);
      }
      return;
    }
    if (typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    let keysVisited = 0;
    for (const [key, value] of Object.entries(record)) {
      if (keysVisited++ > 30 || results.length >= MAX_RECEIPT_CANDIDATES) break;
      if (RECEIPT_KEYS.has(key)) {
        add(value);
      } else if (typeof value === 'object' && value !== null) {
        walk(value, depth + 1);
      }
    }
  };

  walk(payload, 0);
  return results;
}
