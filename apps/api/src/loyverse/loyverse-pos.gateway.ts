import { Inject, Injectable } from '@nestjs/common';
import { PosGatewayError } from '../common/errors';
import type { Clock } from '../common/clock';
import type { AppConfig } from '../config/env';
import { APP_CONFIG, CLOCK, LOYVERSE_HTTP } from '../common/tokens';
import type { HttpClient } from './http-client';
import { buildReceiptCreatePayload, normalizeReceipt } from './receipt.mapper';
import type {
  CreateReceiptInput,
  ListReceiptsParams,
  NormalizedReceipt,
  PosGateway,
  ReceiptRef,
} from './pos-gateway.interface';
import { SlidingWindowRateLimiter } from './rate-limiter';
import type { PosErrorKind } from '../common/errors';

interface LoyverseCreateResponse {
  receipt_number?: string;
  number?: string;
}

const receiptsFrom = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const list = (value as Record<string, unknown>)['receipts'];
    if (Array.isArray(list)) return list;
  }
  return [];
};

/** Loyverse list endpoints return a pagination cursor for the next page. */
const cursorFrom = (value: unknown): string | null => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const cursor = (value as Record<string, unknown>)['cursor'];
    if (typeof cursor === 'string' && cursor.length > 0 && cursor.length <= 512) return cursor;
  }
  return null;
};

const DEFAULT_RECEIPT_PAGE_SIZE = 50;
/** Bound pagination so a single poll can never blow the 300/300s rate budget. */
const MAX_RECEIPT_PAGES = 10;

/**
 * Real Loyverse adapter. All four outbound calls go through the injected
 * HttpClient and are rate-limited (300/300s). Every library/network/HTTP error
 * is translated into a typed PosGatewayError at the call site — a raw error
 * never escapes. See the boundary failure tests in loyverse-pos.gateway.spec.ts.
 */
@Injectable()
export class LoyversePosGateway implements PosGateway {
  private readonly limiter: SlidingWindowRateLimiter;

  constructor(
    @Inject(LOYVERSE_HTTP) private readonly http: HttpClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.limiter = new SlidingWindowRateLimiter(
      clock,
      config.loyverseRateLimit,
      config.loyverseRateWindowMs,
    );
  }

  private acquire(): void {
    if (!this.limiter.tryAcquire()) {
      throw new PosGatewayError('Loyverse rate limit reached (300/300s)', 'rate_limit');
    }
  }

  async createReceipt(input: CreateReceiptInput): Promise<ReceiptRef> {
    this.acquire();
    const body = buildReceiptCreatePayload(input);
    try {
      const response = await this.http.post<LoyverseCreateResponse>('/receipts', body);
      const number = response?.receipt_number ?? response?.number;
      if (!number) {
        throw new PosGatewayError(
          'Loyverse create response missing receipt_number',
          'invalid_request',
        );
      }
      return { receiptNumber: number };
    } catch (err) {
      throw this.translate('createReceipt', err);
    }
  }

  async findReceiptByOrder(orderId: string): Promise<ReceiptRef | null> {
    this.acquire();
    try {
      const response = await this.http.get<unknown>('/receipts', { order: orderId });
      const list = receiptsFrom(response);
      for (const entry of list) {
        try {
          return { receiptNumber: normalizeReceipt(entry).receiptNumber };
        } catch {
          // skip malformed entries, look at the next candidate
        }
      }
      return null;
    } catch (err) {
      throw this.translate('findReceiptByOrder', err);
    }
  }

  async getReceipt(receiptNumber: string): Promise<NormalizedReceipt> {
    this.acquire();
    try {
      const response = await this.http.get<unknown>(
        `/receipts/${encodeURIComponent(receiptNumber)}`,
      );
      return normalizeReceipt(response);
    } catch (err) {
      throw this.translate('getReceipt', err);
    }
  }

  async listReceipts(params: ListReceiptsParams): Promise<NormalizedReceipt[]> {
    const result: NormalizedReceipt[] = [];
    let cursor = params.cursor;
    for (let page = 0; page < MAX_RECEIPT_PAGES; page++) {
      this.acquire();
      const query: Record<string, string | number> = {
        store_id: params.storeId,
        updated_at_min: params.updatedAtMin,
        limit: params.limit ?? DEFAULT_RECEIPT_PAGE_SIZE,
      };
      if (cursor) query['cursor'] = cursor;
      let response: unknown;
      try {
        response = await this.http.get<unknown>('/receipts', query);
      } catch (err) {
        throw this.translate('listReceipts', err);
      }
      for (const entry of receiptsFrom(response)) {
        try {
          result.push(normalizeReceipt(entry));
        } catch {
          // partial/malformed receipt is skipped, never aborts the poll
        }
      }
      const next = cursorFrom(response);
      if (!next || next === cursor) break;
      cursor = next;
    }
    return result;
  }

  /** Translate any thrown error into a typed, retryable PosGatewayError. */
  private translate(operation: string, err: unknown): PosGatewayError {
    if (err instanceof PosGatewayError) return err;
    const candidate = err as {
      response?: { status?: number };
      status?: number;
      code?: string;
    } | null;
    const status = candidate?.response?.status ?? candidate?.status;
    const code = candidate?.code;
    let kind: PosErrorKind = 'unavailable';
    if (status === 401 || status === 403) kind = 'auth';
    else if (status === 429) kind = 'rate_limit';
    else if (status === 400 || status === 422) kind = 'invalid_request';
    else if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') kind = 'unavailable';
    return new PosGatewayError(`Loyverse ${operation} failed`, kind, err);
  }
}
