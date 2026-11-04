import type { ProviderVerifyOptions } from "../common/types.js";

/**
 * Standard shape of a Shopify Webhook Event payload.
 */
export interface ShopifyWebhookEvent {
  id?: number | string;
  admin_graphql_api_id?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

/**
 * Options for Shopify webhook verification.
 */
export interface ShopifyVerifyOptions extends ProviderVerifyOptions {
  /**
   * X-Shopify-Hmac-Sha256 base64-encoded signature header.
   */
  signature?: string;

  /**
   * If true, throws errors rather than returning `{ valid: false, error }`.
   */
  throwOnError?: boolean;

  /**
   * Whether to automatically parse the verified body as JSON. Defaults to true.
   */
  parseJson?: boolean;
}
