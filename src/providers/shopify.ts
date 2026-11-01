import type { WebhookVerificationResult } from "../types.js";
import type { ProviderVerifyOptions } from "./types.js";

export interface ShopifyVerifyOptions extends ProviderVerifyOptions {
  /**
   * X-Shopify-Hmac-Sha256 base64-encoded signature header.
   */
  signature?: string;
}

/**
 * Verifies a Shopify webhook payload signature against `X-Shopify-Hmac-Sha256`.
 *
 * Shopify computes HMAC-SHA256 of the raw body and encodes it as Base64.
 *
 * @param options - Shopify verification options
 * @returns Verification result with typed payload
 */
export async function verifyShopifyWebhook<T = unknown>(
  _options: ShopifyVerifyOptions,
): Promise<WebhookVerificationResult<T>> {
  // TODO: Implement Shopify base64 HMAC verification
  throw new Error(
    "verifyShopifyWebhook: stub implementation pending full cryptographic logic",
  );
}
