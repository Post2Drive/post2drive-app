/**
 * Provider-independent integration contracts for Post2Drive.
 *
 * These interfaces describe boundaries only. They do not send email/SMS,
 * collect payments, or imply delivery/settlement. Production adapters must be
 * explicitly registered and configured; tests should inject deterministic
 * fakes rather than enabling a fake adapter through production environment
 * variables.
 */

export type DeliveryResult =
  | { accepted: true; providerMessageId: string }
  | { accepted: false; reason: "not_configured" | "temporarily_unavailable" | "rejected" };

export interface TransactionalEmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface TransactionalEmailProvider {
  readonly providerId: string;
  send(message: TransactionalEmailMessage): Promise<DeliveryResult>;
}

export interface SmsOtpMessage {
  toE164: string;
  code: string;
  expiresAt: Date;
}

export interface SmsOtpProvider {
  readonly providerId: string;
  sendOtp(message: SmsOtpMessage): Promise<DeliveryResult>;
}

/**
 * Marketplace plan/pricing stays in application code. A payment adapter only
 * creates provider-side checkout and verifies provider-originated events.
 */
export type PaymentEvent =
  | { type: "checkout.completed"; providerPaymentId: string; accountId: string; amountMinorUnits: number; currency: string; occurredAt: Date }
  | { type: "payment.failed"; providerPaymentId: string; accountId: string; occurredAt: Date }
  | { type: "payment.refunded"; providerPaymentId: string; accountId: string; amountMinorUnits: number; currency: string; occurredAt: Date };

export interface CreateCheckoutRequest {
  accountId: string;
  planKey: string;
  amountMinorUnits: number;
  currency: string;
  idempotencyKey: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  providerCheckoutId: string;
  redirectUrl: string;
  expiresAt: Date | null;
}

export interface PaymentProvider {
  readonly providerId: string;
  createCheckout(request: CreateCheckoutRequest): Promise<CheckoutSession>;
  /** Return a verified event only after authentic provider signature checks. */
  verifyWebhook(rawBody: string, signature: string | null): Promise<PaymentEvent | null>;
}

export type ProviderReadiness =
  | { configured: false; reason: "provider_not_selected" | "adapter_not_registered" | "credentials_missing" }
  | { configured: true; providerId: string };

/**
 * A delivery/checkout request being accepted is not proof of user receipt,
 * successful verification, a captured payment, or a settled payout. Those
 * state transitions belong to the relevant verified callback/workflow.
 */
