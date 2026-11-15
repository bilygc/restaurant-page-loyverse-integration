/** Injectable clock so business hours, retries and expirations are testable. */
export interface Clock {
  now(): Date;
  nowMs(): number;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
  nowMs(): number {
    return Date.now();
  }
}

/** Deterministic clock for tests. */
export class FakeClock implements Clock {
  constructor(private currentMs: number) {}
  now(): Date {
    return new Date(this.currentMs);
  }
  nowMs(): number {
    return this.currentMs;
  }
  advance(ms: number): void {
    this.currentMs += ms;
  }
  set(ms: number): void {
    this.currentMs = ms;
  }
}
