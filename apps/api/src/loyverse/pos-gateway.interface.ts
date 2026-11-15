/** A single line on a receipt we create: only variant + quantity (Loyverse owns price). */
export interface ReceiptLineInput {
  variantId: string;
  quantity: number;
}

export interface CreateReceiptInput {
  storeId: string;
  /** Our order id, written into the writable Loyverse `order` field. */
  orderId: string;
  source: string;
  diningOption: string | null;
  note: string | null;
  lineItems: ReceiptLineInput[];
  paymentTypeId: string;
  totalCentavos: number;
}

export interface ReceiptRef {
  receiptNumber: string;
}

export interface NormalizedLineItem {
  variantId: string | null;
  itemName: string | null;
  quantity: number;
  unitPriceCentavos: number;
  lineNote: string | null;
}

/** Canonical receipt, fetched via GET (never built from an untrusted webhook body). */
export interface NormalizedReceipt {
  receiptNumber: string;
  source: string | null;
  order: string | null;
  createdAt: string | null;
  lineItems: NormalizedLineItem[];
  totalCentavos: number;
}

export interface ListReceiptsParams {
  storeId: string;
  /** ISO timestamp lower bound for the polling window (updated_at_min). */
  updatedAtMin: string;
  /** Loyverse pagination cursor for the next page (if any). */
  cursor?: string;
  limit?: number;
}

/**
 * Loyverse POS boundary. Everything outbound is behind this injectable
 * interface with a fake for tests (Open Risk Gate: POC authorized to generate
 * evidence H1-H8; real-device validation remains a human step).
 */
export interface PosGateway {
  /** POST /receipts */
  createReceipt(input: CreateReceiptInput): Promise<ReceiptRef>;
  /** GET /receipts?order=<id> — reconciliation before a retry (idempotency). */
  findReceiptByOrder(orderId: string): Promise<ReceiptRef | null>;
  /** GET /receipts/{number} — canonical fetch for ingestion. */
  getReceipt(receiptNumber: string): Promise<NormalizedReceipt>;
  /** GET /receipts?store_id&updated_at_min[&cursor] — poller (bounded pages). */
  listReceipts(params: ListReceiptsParams): Promise<NormalizedReceipt[]>;
}
