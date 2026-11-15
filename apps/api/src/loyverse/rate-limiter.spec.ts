import { describe, expect, it } from 'vitest';
import { FakeClock } from '../common/clock';
import { SlidingWindowRateLimiter } from './rate-limiter';

describe('SlidingWindowRateLimiter (300 / 300s awareness)', () => {
  it('allows up to the limit and refuses the next call', () => {
    const clock = new FakeClock(0);
    const limiter = new SlidingWindowRateLimiter(clock, 3, 1000);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });

  it('frees capacity as the window slides', () => {
    const clock = new FakeClock(0);
    const limiter = new SlidingWindowRateLimiter(clock, 3, 1000);
    limiter.tryAcquire();
    limiter.tryAcquire();
    limiter.tryAcquire();
    expect(limiter.tryAcquire()).toBe(false);
    clock.advance(1001);
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('models the real 300/300s budget', () => {
    const clock = new FakeClock(0);
    const limiter = new SlidingWindowRateLimiter(clock, 300, 300000);
    for (let i = 0; i < 300; i++) expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
  });
});
