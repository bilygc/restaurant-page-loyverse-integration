/**
 * Typed domain errors. The global exception filter maps these to HTTP and
 * NEVER leaks raw library errors, stack traces, secrets or PII.
 * Boundary errors (database / POS / payment) are translated at the call site
 * into one of these before they can propagate.
 */

export type DomainErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'UNAUTHORIZED'
  | 'PAYMENT_REQUIRED'
  | 'PAYMENT_MODE'
  | 'CONFIG'
  | 'DATABASE'
  | 'POS_GATEWAY'
  | 'INTERNAL';

export class DomainError extends Error {
  readonly httpStatus: number;
  readonly code: DomainErrorCode;

  constructor(message: string, httpStatus: number, code: DomainErrorCode) {
    super(message);
    this.name = new.target.name;
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

// ---- 4xx client errors (safe, user-facing messages) ----
export class ValidationError extends DomainError {
  constructor(message = 'Request validation failed') {
    super(message, 400, 'VALIDATION');
  }
}
export class NotFoundError extends DomainError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}
export class ConflictError extends DomainError {
  constructor(message = 'Conflict') {
    super(message, 409, 'CONFLICT');
  }
}
export class ForbiddenError extends DomainError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}
export class PaymentRequiredError extends DomainError {
  constructor(message = 'Payment required') {
    super(message, 402, 'PAYMENT_REQUIRED');
  }
}

// ---- boot / config errors (fail fast; message names variables, not values) ----
export class ConfigError extends DomainError {
  constructor(message: string) {
    super(message, 500, 'CONFIG');
  }
}
export class PaymentModeError extends DomainError {
  constructor(message: string) {
    super(message, 500, 'PAYMENT_MODE');
  }
}

// ---- boundary errors (translated at the call site, 5xx safe) ----
export class DatabaseError extends DomainError {
  readonly dbCode?: string;
  readonly cause?: unknown;
  constructor(message: string, dbCode?: string, cause?: unknown) {
    super(message, 503, 'DATABASE');
    this.dbCode = dbCode;
    this.cause = cause;
  }
  /** Postgres unique_violation — expected for dedup / idempotency, not a fault. */
  isUniqueViolation(): boolean {
    return this.dbCode === '23505';
  }
}

export type PosErrorKind = 'auth' | 'rate_limit' | 'unavailable' | 'invalid_request' | 'unknown';

export class PosGatewayError extends DomainError {
  readonly kind: PosErrorKind;
  readonly cause?: unknown;
  constructor(message: string, kind: PosErrorKind = 'unknown', cause?: unknown) {
    super(message, 502, 'POS_GATEWAY');
    this.kind = kind;
    this.cause = cause;
  }
  /** All POS failures are retryable from the outbox's point of view. */
  get retryable(): boolean {
    return true;
  }
}
