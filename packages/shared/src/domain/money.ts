/**
 * Money helpers — the ONLY place where rounding / money math lives.
 * All internal money is INTEGER CENTAVOS (MXN). No floating-point arithmetic
 * is ever performed on money. External decimal values (e.g. Loyverse prices)
 * are converted here with a single, string-based, half-up rounding rule.
 */

export interface PricedLine {
  quantity: number;
  unitPriceCentavos: number;
}

/** True for a non-negative, safe integer number of centavos. */
export function isIntegerCentavos(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Recompute an order total from its sold-as line items using integer math only.
 * Throws (never silently truncates) on non-integer / negative / overflowing
 * inputs, because a wrong total is a money bug.
 */
export function computeTotalCentavos(items: ReadonlyArray<PricedLine>): number {
  let total = 0;
  for (const item of items) {
    if (
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0 ||
      !Number.isSafeInteger(item.unitPriceCentavos) ||
      item.unitPriceCentavos < 0
    ) {
      throw new Error(
        'Invalid line item: quantity and unitPriceCentavos must be positive integers',
      );
    }
    total += item.quantity * item.unitPriceCentavos;
    if (!Number.isSafeInteger(total)) {
      throw new Error('Order total overflow: total_centavos is not a safe integer');
    }
  }
  return total;
}

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/**
 * Convert an external decimal (string or number) to integer centavos with
 * half-up rounding on the third decimal. Parsing is done on the decimal STRING
 * (never `value * 100`) so no float arithmetic touches money.
 */
export function decimalToCentavos(value: string | number): number {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('Invalid decimal money value: not finite');
  }
  const text = String(value).trim();
  if (text.length > 32 || !DECIMAL_RE.test(text)) {
    throw new Error('Invalid decimal money value');
  }
  const negative = text.startsWith('-');
  const [intPart, frac = ''] = text.replace('-', '').split('.');
  const wholeCentavos = Number(intPart) * 100 + Number((frac + '00').slice(0, 2));
  const thirdDecimal = Number((frac + '000').slice(2, 3));
  let centavos = wholeCentavos + (thirdDecimal >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(centavos)) {
    throw new Error('Decimal money value overflow');
  }
  if (negative) centavos = -centavos;
  return centavos;
}

/** Format integer centavos as a fixed 2-decimal currency string (for Loyverse). */
export function centavosToDecimalString(centavos: number): string {
  if (!Number.isSafeInteger(centavos)) {
    throw new Error('centavosToDecimalString expects an integer');
  }
  const sign = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}
