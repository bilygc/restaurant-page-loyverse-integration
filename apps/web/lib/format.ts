/**
 * Display-only formatting helpers. Money stays in INTEGER CENTAVOS everywhere;
 * the only conversion is the shared, string-based `centavosToDecimalString`
 * (no floating-point arithmetic on money). Intl formats from that decimal
 * string so totals are never computed with floats.
 */
import { centavosToDecimalString } from '@restaurant/shared';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** ES2023 Intl.NumberFormat V3 accepts a decimal string; TS lib.dom still types
 * only number|bigint. Node 20 and current tablet browsers support the string. */
type StringFormat = { format(value: string): string };

/**
 * Format integer centavos as MXN currency (e.g. 3500 -> "$35.00").
 * Returns an em dash for invalid input rather than throwing in the UI.
 */
export function formatCentavos(centavos: number): string {
  if (!Number.isSafeInteger(centavos) || centavos < 0) return '—';
  const decimal = centavosToDecimalString(centavos); // integer-only, string-based
  try {
    return (MXN as unknown as StringFormat).format(decimal);
  } catch {
    // Older runtimes without the string overload: display-only conversion.
    return MXN.format(centavos / 100);
  }
}

/** Elapsed time since an ISO timestamp. "M:SS" under an hour, "H:MM:SS" beyond. */
export function formatElapsed(createdAtIso: string, nowMs: number): string {
  const created = Date.parse(createdAtIso);
  if (!Number.isFinite(created) || !Number.isFinite(nowMs)) return '—';
  const totalSeconds = Math.max(0, Math.floor((nowMs - created) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

/** Urgency tier for the elapsed timer (minutes). Pure, for styling only. */
export function elapsedUrgency(createdAtIso: string, nowMs: number): 'normal' | 'warn' | 'late' {
  const created = Date.parse(createdAtIso);
  if (!Number.isFinite(created)) return 'normal';
  const minutes = Math.floor(Math.max(0, nowMs - created) / 60000);
  if (minutes >= 20) return 'late';
  if (minutes >= 10) return 'warn';
  return 'normal';
}
