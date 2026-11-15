/**
 * plan.md §9.5 safeguard. Pure, unit-testable predicate for showing the
 * POC-only "Simular pago" button. Shown ONLY in mock payment mode AND outside
 * production. `NEXT_PUBLIC_PAYMENT_MODE` is a PUBLIC, UI-only flag (no secret)
 * that mirrors the API's PAYMENT_MODE but is read independently; the API also
 * refuses to boot with mock in production.
 *
 * Fail-closed on BOTH inputs: the button stays hidden unless the mode is
 * explicitly "mock" and the environment is known and not production. (Next.js
 * always inlines NODE_ENV, so in practice it is never undefined.)
 */
export function shouldShowSimulatePay(
  paymentMode: string | undefined,
  nodeEnv: string | undefined,
): boolean {
  return paymentMode === 'mock' && nodeEnv !== undefined && nodeEnv !== 'production';
}
