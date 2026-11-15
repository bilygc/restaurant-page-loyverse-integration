import { describe, expect, it } from 'vitest';
import { elapsedUrgency, formatCentavos, formatElapsed } from './format';

const BASE = Date.parse('2024-01-01T00:00:00.000Z');
const ISO = '2024-01-01T00:00:00.000Z';

describe('formatCentavos', () => {
  it('formats integer centavos as MXN currency with two decimals', () => {
    const out = formatCentavos(3500);
    expect(out).toContain('35.00');
    expect(out).toContain('$');
  });

  it('keeps the cents for values ending in 50 (no float rounding)', () => {
    expect(formatCentavos(1050)).toContain('10.50');
  });

  it('formats zero', () => {
    expect(formatCentavos(0)).toContain('0.00');
  });

  it('formats large amounts from integer centavos', () => {
    // 123456789 centavos = 1,234,567.89 MXN
    expect(formatCentavos(123456789)).toContain('.89');
  });

  it.each([
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])('returns an em dash for invalid input %p', (value) => {
    expect(formatCentavos(value)).toBe('—');
  });
});

describe('formatElapsed', () => {
  it('uses M:SS under an hour', () => {
    expect(formatElapsed(ISO, BASE + 5_000)).toBe('0:05');
    expect(formatElapsed(ISO, BASE + 65_000)).toBe('1:05');
    expect(formatElapsed(ISO, BASE + 599_000)).toBe('9:59');
  });

  it('uses H:MM:SS from one hour onwards', () => {
    expect(formatElapsed(ISO, BASE + 3_600_000)).toBe('1:00:00');
    expect(formatElapsed(ISO, BASE + 3_661_000)).toBe('1:01:01');
  });

  it('clamps a negative elapsed time to zero', () => {
    expect(formatElapsed(ISO, BASE - 10_000)).toBe('0:00');
  });

  it('returns an em dash for invalid timestamps / now', () => {
    expect(formatElapsed('not-a-date', BASE)).toBe('—');
    expect(formatElapsed(ISO, Number.NaN)).toBe('—');
    expect(formatElapsed(ISO, Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('elapsedUrgency', () => {
  it('is normal before 10 minutes', () => {
    expect(elapsedUrgency(ISO, BASE)).toBe('normal');
    expect(elapsedUrgency(ISO, BASE + 9 * 60_000)).toBe('normal');
  });

  it('is warn from 10 to 19 minutes', () => {
    expect(elapsedUrgency(ISO, BASE + 10 * 60_000)).toBe('warn');
    expect(elapsedUrgency(ISO, BASE + 19 * 60_000)).toBe('warn');
  });

  it('is late at 20+ minutes', () => {
    expect(elapsedUrgency(ISO, BASE + 20 * 60_000)).toBe('late');
    expect(elapsedUrgency(ISO, BASE + 60 * 60_000)).toBe('late');
  });

  it('falls back to normal for an invalid timestamp', () => {
    expect(elapsedUrgency('not-a-date', BASE)).toBe('normal');
  });
});
