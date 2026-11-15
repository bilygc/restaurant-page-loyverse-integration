import { describe, expect, it } from 'vitest';
import { computeBackoffMs } from './backoff';

describe('computeBackoffMs (deterministic integer backoff)', () => {
  it('grows exponentially from the base and caps at max', () => {
    expect(computeBackoffMs(0, 1000, 60000)).toBe(1000);
    expect(computeBackoffMs(1, 1000, 60000)).toBe(1000);
    expect(computeBackoffMs(2, 1000, 60000)).toBe(2000);
    expect(computeBackoffMs(3, 1000, 60000)).toBe(4000);
    expect(computeBackoffMs(10, 1000, 60000)).toBe(60000);
  });
  it('never exceeds max even for absurd attempt counts', () => {
    expect(computeBackoffMs(1000, 1000, 60000)).toBe(60000);
  });
});
