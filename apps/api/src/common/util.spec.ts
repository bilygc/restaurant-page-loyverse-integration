import { describe, expect, it } from 'vitest';
import { safeEqual, sanitizeText } from './util';

describe('safeEqual (constant-time secret comparison)', () => {
  it('matches equal secrets', () => {
    expect(safeEqual('kitchen-pin', 'kitchen-pin')).toBe(true);
  });
  it('rejects different secrets, including different lengths', () => {
    expect(safeEqual('kitchen-pin', 'kitchen-pim')).toBe(false);
    expect(safeEqual('short', 'a-much-longer-secret')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('sanitizeText (untrusted text bounding)', () => {
  it('strips control characters and bounds length', () => {
    expect(sanitizeText('a\u0000b\u001fc', 10)).toBe('a b c');
    expect(sanitizeText('x'.repeat(50), 8)).toHaveLength(8);
    expect(sanitizeText(null, 10)).toBe('');
    expect(sanitizeText('  hello  ', 20)).toBe('hello');
  });
});
