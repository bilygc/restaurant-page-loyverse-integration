import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ForbiddenError } from '../common/errors';
import { APP_CONFIG, KITCHEN_PIN_HEADER, X_KITCHEN_PIN_HEADER } from '../common/tokens';
import { safeEqual } from '../common/util';
import type { AppConfig } from '../config/env';

/**
 * Simple PIN guard for the kitchen screen (plan.md §9.7). Accepts the
 * task-canonical `X-Kitchen-Pin` header or the legacy `KITCHEN_PIN` alias and
 * compares it in constant time (timingSafeEqual via hashed fixed-length buffers)
 * against the configured PIN. Not full authentication — POC only.
 */
@Injectable()
export class KitchenPinGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = this.firstHeader(request, [X_KITCHEN_PIN_HEADER, KITCHEN_PIN_HEADER]);
    if (typeof provided !== 'string' || !safeEqual(provided, this.config.kitchenPin)) {
      throw new ForbiddenError('Invalid kitchen PIN');
    }
    return true;
  }

  private firstHeader(request: Request, names: string[]): string | undefined {
    for (const name of names) {
      const value = request.headers[name.toLowerCase()];
      const single = Array.isArray(value) ? value[0] : value;
      if (typeof single === 'string') return single;
    }
    return undefined;
  }
}
