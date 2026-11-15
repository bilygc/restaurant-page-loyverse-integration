import { createHash, timingSafeEqual } from 'node:crypto';
import { DomainError } from './errors';

/**
 * Constant-time string comparison. Hashing first gives fixed-length buffers,
 * so comparing values of different lengths is safe and still constant-time.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Replace control characters with spaces without embedding a control-char regex. */
const stripControlChars = (value: string): string =>
  Array.from(value)
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code < 0x20 || code === 0x7f ? ' ' : char;
    })
    .join('');

/**
 * Bound and sanitize untrusted text before it is ever rendered (Loyverse note,
 * tickets, kitchen cards). Strips control characters and caps length.
 */
export function sanitizeText(value: string | null | undefined, maxLength: number): string {
  if (!value) return '';
  return stripControlChars(value).trim().slice(0, maxLength);
}

/** Sanitized, length-bounded text or null (for nullable DB text columns). */
export function boundedTextOrNull(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  const text = sanitizeText(value, maxLength);
  return text.length ? text : null;
}

/** A short, safe tag for logging an error: never the message, values or stack. */
export function safeErrorTag(err: unknown): string {
  if (err instanceof DomainError) return `${err.name}:${err.code}`;
  if (err instanceof Error) return err.name;
  return 'NonError';
}

/** Optional kind tag for POS errors, used only in diagnostics (no raw detail). */
export function safeErrorKind(err: unknown): string {
  const kind = (err as { kind?: unknown } | null)?.kind;
  return typeof kind === 'string' ? kind : '';
}
