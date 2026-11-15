/**
 * Deterministic exponential backoff (integer ms), capped at maxMs. Pure and
 * testable; no jitter/random so retry timing is reproducible in tests.
 */
export function computeBackoffMs(attempts: number, baseMs: number, maxMs: number): number {
  if (attempts < 1) return baseMs;
  const raw = baseMs * Math.pow(2, attempts - 1);
  if (!Number.isFinite(raw)) return maxMs;
  return Math.min(maxMs, Math.max(baseMs, raw));
}
