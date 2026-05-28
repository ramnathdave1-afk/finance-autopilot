// StripeAdapter — the single seam between our code and the real Stripe SDK.
// Tests inject a MockAdapter. Production wires a RealStripeAdapter that calls
// the Stripe SDK (TODO(integrate-stripe-sdk)).
//
// Anything that would talk to api.stripe.com goes through here, so the rest of
// the codebase stays SDK-free and testable.

export interface StripeCheckoutSessionInput {
  customerId: string | null;
  customerEmail?: string | undefined;
  priceId: string;
  couponId?: string | undefined;
  successUrl: string;
  cancelUrl: string;
  /** Stripe metadata propagated onto the subscription. */
  metadata?: Record<string, string> | undefined;
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
  customerId: string | null;
}

export interface StripePortalSession {
  id: string;
  url: string;
}

export interface StripeRefundInput {
  /** Stripe charge or payment_intent id to refund against. */
  chargeId: string;
  amountCents: number;
  /** Stable key — Stripe dedupes refunds for the same key. */
  idempotencyKey: string;
  metadata?: Record<string, string> | undefined;
}

export interface StripeRefund {
  id: string;
  amountCents: number;
  status: 'succeeded' | 'pending' | 'failed';
}

export interface StripeCancellation {
  subscriptionId: string;
  cancelAt: number; // unix seconds at period end
  status: 'active' | 'canceled';
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
  created: number;
}

export interface StripeAdapter {
  createCheckoutSession(input: StripeCheckoutSessionInput): Promise<StripeCheckoutSession>;
  createPortalSession(customerId: string, returnUrl: string): Promise<StripePortalSession>;
  cancelSubscriptionAtPeriodEnd(subscriptionId: string): Promise<StripeCancellation>;
  refund(input: StripeRefundInput): Promise<StripeRefund>;
  /** Signature verification. Returns the parsed event or throws. */
  constructWebhookEvent(rawBody: string, signature: string, secret: string): StripeWebhookEvent;
}

/**
 * Default adapter — every call throws. Production must call setAdapter() with
 * a real implementation; tests inject a MockAdapter.
 */
export class StubAdapter implements StripeAdapter {
  createCheckoutSession(): Promise<StripeCheckoutSession> {
    throw new Error('StubAdapter: setAdapter() with a real or mock Stripe adapter first');
  }
  createPortalSession(): Promise<StripePortalSession> {
    throw new Error('StubAdapter: setAdapter() with a real or mock Stripe adapter first');
  }
  cancelSubscriptionAtPeriodEnd(): Promise<StripeCancellation> {
    throw new Error('StubAdapter: setAdapter() with a real or mock Stripe adapter first');
  }
  refund(): Promise<StripeRefund> {
    throw new Error('StubAdapter: setAdapter() with a real or mock Stripe adapter first');
  }
  constructWebhookEvent(): StripeWebhookEvent {
    throw new Error('StubAdapter: setAdapter() with a real or mock Stripe adapter first');
  }
}

let _adapter: StripeAdapter = new StubAdapter();

export function setAdapter(adapter: StripeAdapter): void {
  _adapter = adapter;
}

export function getAdapter(): StripeAdapter {
  return _adapter;
}

/** Test helper. Restores the stub. */
export function _resetAdapter(): void {
  _adapter = new StubAdapter();
}
