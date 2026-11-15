import type { Clock } from '../common/clock';

/**
 * Client-side awareness of the Loyverse rate limit (300 requests / 300 s).
 * A sliding window refuses the 301st call instead of blindly hitting the API
 * and getting a 429. The outbox treats the resulting RateLimitError as
 * retryable with backoff.
 */
export class SlidingWindowRateLimiter {
  private timestamps: number[] = [];

  constructor(
    private readonly clock: Clock,
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  tryAcquire(): boolean {
    const now = this.clock.nowMs();
    const cutoff = now - this.windowMs;
    this.timestamps = this.timestamps.filter((t) => t > cutoff);
    if (this.timestamps.length >= this.limit) return false;
    this.timestamps.push(now);
    return true;
  }
}
