import { describe, expect, it } from 'vitest';
import {
  centavosToDecimalString,
  computeTotalCentavos,
  decimalToCentavos,
  isIntegerCentavos,
} from './money';

describe('money: integer centavos only', () => {
  describe('isIntegerCentavos', () => {
    it('accepts non-negative safe integers', () => {
      expect(isIntegerCentavos(0)).toBe(true);
      expect(isIntegerCentavos(1)).toBe(true);
      expect(isIntegerCentavos(999999)).toBe(true);
    });
    it('rejects floats, negatives, NaN, Infinity and unsafe integers', () => {
      expect(isIntegerCentavos(10.5)).toBe(false);
      expect(isIntegerCentavos(-1)).toBe(false);
      expect(isIntegerCentavos(NaN)).toBe(false);
      expect(isIntegerCentavos(Infinity)).toBe(false);
      expect(isIntegerCentavos(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    });
  });

  describe('computeTotalCentavos', () => {
    it('sums quantity * unit price with integer arithmetic', () => {
      expect(
        computeTotalCentavos([
          { quantity: 2, unitPriceCentavos: 7500 },
          { quantity: 1, unitPriceCentavos: 3250 },
        ]),
      ).toBe(18250);
    });
    it('returns 0 for an empty order', () => {
      expect(computeTotalCentavos([])).toBe(0);
    });
    it('never uses float arithmetic (0.1-style inputs are rejected)', () => {
      expect(() => computeTotalCentavos([{ quantity: 1, unitPriceCentavos: 0.1 }])).toThrow();
      expect(() => computeTotalCentavos([{ quantity: 1.5, unitPriceCentavos: 100 }])).toThrow();
      expect(() => computeTotalCentavos([{ quantity: 1, unitPriceCentavos: -100 }])).toThrow();
      expect(() => computeTotalCentavos([{ quantity: -1, unitPriceCentavos: 100 }])).toThrow();
      expect(() => computeTotalCentavos([{ quantity: 0, unitPriceCentavos: 100 }])).toThrow();
    });
    it('throws on integer overflow instead of silently losing money', () => {
      expect(() =>
        computeTotalCentavos([
          { quantity: Number.MAX_SAFE_INTEGER, unitPriceCentavos: Number.MAX_SAFE_INTEGER },
        ]),
      ).toThrow();
    });
  });

  describe('decimalToCentavos (the single rounding helper for external decimals)', () => {
    it('parses plain and decimal string/number values', () => {
      expect(decimalToCentavos('75')).toBe(7500);
      expect(decimalToCentavos('75.5')).toBe(7550);
      expect(decimalToCentavos('75.05')).toBe(7505);
      expect(decimalToCentavos(0.1)).toBe(10);
      expect(decimalToCentavos('0')).toBe(0);
    });
    it('rounds half-up on the third decimal', () => {
      expect(decimalToCentavos('1.005')).toBe(101);
      expect(decimalToCentavos('1.004')).toBe(100);
      expect(decimalToCentavos('1.006')).toBe(101);
      expect(decimalToCentavos('0.999')).toBe(100);
    });
    it('handles negatives as a signed magnitude', () => {
      expect(decimalToCentavos('-3.50')).toBe(-350);
    });
    it('rejects malformed / non-finite input', () => {
      expect(() => decimalToCentavos('abc')).toThrow();
      expect(() => decimalToCentavos('')).toThrow();
      expect(() => decimalToCentavos(NaN)).toThrow();
      expect(() => decimalToCentavos(Infinity)).toThrow();
      expect(() => decimalToCentavos('12,50')).toThrow();
    });
  });

  describe('centavosToDecimalString', () => {
    it('formats integer centavos as a 2-decimal currency string', () => {
      expect(centavosToDecimalString(12345)).toBe('123.45');
      expect(centavosToDecimalString(5)).toBe('0.05');
      expect(centavosToDecimalString(100)).toBe('1.00');
      expect(centavosToDecimalString(0)).toBe('0.00');
      expect(centavosToDecimalString(-350)).toBe('-3.50');
    });
    it('round-trips with decimalToCentavos', () => {
      for (const c of [0, 1, 99, 100, 12345, 999999]) {
        expect(decimalToCentavos(centavosToDecimalString(c))).toBe(c);
      }
    });
  });
});
