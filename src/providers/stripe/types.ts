import type { ProviderVerifyOptions } from "../common/types.js";

/**
 * Parsed components of a `Stripe-Signature` header.
 */
export interface StripeParsedSignatureHeader {
  /**
   * Extracted Unix timestamp in seconds.
   */
  timestamp: number;

  /**
   * One or more valid v1 HMAC-SHA256 signatures.
   */
  signatures: string[];

  /**
   * Optional v0 legacy signatures if present.
   */
  v0Signatures?: string[];
}

/**
 * Standard shape of a Stripe Webhook Event payload.
 */
export interface StripeWebhookEvent {
  id: string;
  object: string;
  type: string;
  created: number;
  data: {
    object: Record<string, unknown>;
    [key: string]: unknown;
  };
  livemode?: boolean;
  pending_webhooks?: number;
  request?: {
    id: string | null;
    idempotency_key: string | null;
  };
  [key: string]: unknown;
}

/**
 * Options for Stripe webhook verification.
 */
export interface StripeVerifyOptions extends ProviderVerifyOptions {
  /**
   * Stripe-Signature header format: `t=1492774577,v1=5257a869e7ecebeda32affa62cd4923...`
   */
  signature?: string;

  /**
   * Timestamp tolerance window in seconds (Stripe default is 300s).
   * Pass 0 to disable replay protection check.
   */
  toleranceSeconds?: number;

  /**
   * Current Unix timestamp in seconds (defaults to Math.floor(Date.now() / 1000)).
   * Useful for deterministic testing.
   */
  currentTimestamp?: number;

  /**
   * If true, throws errors rather than returning `{ valid: false, error }`.
   */
  throwOnError?: boolean;
}
