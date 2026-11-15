import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { NotFoundError } from '../common/errors';
import { APP_CONFIG, X_WEBHOOK_TOKEN_HEADER } from '../common/tokens';
import { safeEqual, safeErrorTag } from '../common/util';
import type { AppConfig } from '../config/env';
import { IngestionService } from './ingestion.service';

/** Cap the raw H3 evidence log so a hostile payload cannot flood the logs. */
const MAX_EVIDENCE_LOG_CHARS = 4096;

/**
 * Loyverse `receipts.update` webhook. The webhook is UNSIGNED for PAT, so per
 * the ADR/oracle decision it is protected by a custom secret supplied via the
 * `?token=` query param, the `X-Webhook-Token` header, or a path-token form —
 * all compared in constant time (timingSafeEqual). The body is NEVER trusted as
 * data: we only extract receipt numbers and fetch the canonical receipt via GET
 * before ingesting (H3/H8).
 *
 * Task-canonical route: POST /loyverse/webhooks/receipts. Legacy aliases
 * (/loyverse/webhook, /loyverse/webhook/:token) are kept for existing clients.
 *
 * Returns 2xx quickly; ingestion errors are swallowed (logged, names only) and
 * the poller is the reliable path for eventual consistency.
 */
@Controller()
export class LoyverseWebhookController {
  private readonly logger = new Logger(LoyverseWebhookController.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(IngestionService) private readonly ingestion: IngestionService,
  ) {}

  @Post([
    'loyverse/webhooks/receipts',
    'loyverse/webhooks/receipts/:token',
    'loyverse/webhook',
    'loyverse/webhook/:token',
  ])
  @HttpCode(200)
  async receiptsUpdate(
    @Req() request: Request,
    @Param('token') pathToken: unknown,
    @Query('token') queryToken: unknown,
    @Body() body: unknown,
  ): Promise<{ received: boolean }> {
    const headerValue = request.headers[X_WEBHOOK_TOKEN_HEADER.toLowerCase()];
    const headerToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    const candidates: unknown[] = [queryToken, pathToken, headerToken];
    const authorized = candidates.some(
      (candidate) =>
        typeof candidate === 'string' &&
        candidate.length > 0 &&
        safeEqual(candidate, this.config.loyverseWebhookToken),
    );
    if (!authorized) {
      // Do not reveal that this endpoint exists.
      throw new NotFoundError();
    }

    this.logRawForEvidence(body);
    try {
      await this.ingestion.handleWebhook(body);
    } catch (err) {
      this.logger.warn(`webhook handler failed: ${safeErrorTag(err)}`);
    }
    return { received: true };
  }

  /**
   * H3 evidence: the receipts.update payload is UNDOCUMENTED, so a human needs
   * the raw shape during the POC. Enabled ONLY in development against the
   * separate Loyverse TEST account — never in test/production, and never with
   * real customer data. Remove before go-live. No values are logged elsewhere.
   */
  private logRawForEvidence(body: unknown): void {
    if (this.config.nodeEnv !== 'development') return;
    let bounded: string;
    try {
      const raw = JSON.stringify(body);
      bounded = typeof raw === 'string' ? raw.slice(0, MAX_EVIDENCE_LOG_CHARS) : '[unserializable]';
    } catch {
      bounded = '[unserializable]';
    }
    this.logger.log(`POC_EVIDENCE raw_webhook ${bounded}`);
  }
}
