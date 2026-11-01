import type { WebhookVerificationResult } from "../types.js";
import type { ProviderVerifyOptions } from "./types.js";

export interface StripeVerifyOptions extends ProviderVerifyOptions {
  /**
   * Stripe-Signature header format: `t=1492774577,v1=5257a869e7ecebeda32affa62cd4923...`
   */
  signature?: string;
  /**
   * Timestamp tolerance window in seconds (Stripe default is 300s).
   */
  toleranceSeconds?: number;
}

/**
 * Verifies a Stripe webhook event signature.
 *
 * Stripe computes HMAC-SHA256 over `${timestamp}.${rawPayload}` and compares
 * against the `v1` signature tag in `Stripe-Signature`.
 *
 * @param options - Stripe verification options
 * @returns Verification result with typed payload
 */
export async function verifyStripeWebhook<T = unknown>(
  _options: StripeVerifyOptions,
): Promise<WebhookVerificationResult<T>> {
  // TODO: Implement Stripe signature scheme parser (t=..., v1=...) and tolerance verification
  throw new Error(
    "verifyStripeWebhook: stub implementation pending full cryptographic logic",
  );
}
