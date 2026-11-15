/**
 * Payment boundary. The POC uses a simulated gateway; integrating Stripe later
 * only replaces the implementation behind PAYMENT_GATEWAY (plan.md §9.5).
 */
export interface ChargeInput {
  amountCentavos: number;
  /** Reference id (e.g. a pre-payment order ref). Never contains card data. */
  reference: string;
}

export type PaymentResult =
  { status: 'paid'; reference: string } | { status: 'declined'; code: string };

export interface PaymentGateway {
  charge(input: ChargeInput): Promise<PaymentResult>;
}
