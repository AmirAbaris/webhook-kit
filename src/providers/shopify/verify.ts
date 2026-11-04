import { computeSubtleHmac, timingSafeEqual } from "../../crypto/subtle.js";
import { SignatureVerificationError } from "../../errors.js";
import { checkAndRecordReplay, resolveWebhookEventId } from "../../store.js";
import type {
  WebhookProviderPlugin,
  WebhookVerificationResult,
} from "../../types.js";
import { extractRawBody } from "../../utils/extract-body.js";
import { failVerification, tryParseJson } from "../common/helpers.js";
import {
  resolveShopifySignatureHeader,
  safeParseShopifyHeader,
  SHOPIFY_EVENT_ID_HEADERS,
  validateShopifyPreconditions,
} from "./signature.js";
import type { ShopifyVerifyOptions, ShopifyWebhookEvent } from "./types.js";

/**
 * Verifies a Shopify webhook payload signature against `X-Shopify-Hmac-Sha256`.
 *
 * Shopify computes HMAC-SHA256 of the raw body and encodes it as Base64.
 *
 * @param options - Shopify verification options.
 * @returns Verification result with typed payload.
 */
export async function verifyShopifyWebhook<T = ShopifyWebhookEvent>(
  options: ShopifyVerifyOptions,
): Promise<WebhookVerificationResult<T>> {
  const rawBody = await extractRawBody(options.body);
  const rawHeader = resolveShopifySignatureHeader(options);

  const preconditionError = validateShopifyPreconditions(options, rawHeader);

  if (preconditionError) {
    return failVerification(rawBody, preconditionError, options.throwOnError);
  }

  const parsed = safeParseShopifyHeader(rawHeader!);

  if ("error" in parsed) {
    return failVerification(rawBody, parsed.error, options.throwOnError);
  }

  // WHY: Shopify computes HMAC-SHA256 over the raw body and encodes the digest as Base64.
  const expectedSig = await computeSubtleHmac(
    "SHA-256",
    options.secret,
    rawBody,
    "base64",
  );

  // WHY: Compare Base64 digests in constant time to prevent timing side-channel leaks.
  // Base64 is case-sensitive, so exact character byte sequences must match.
  const isValid = timingSafeEqual(expectedSig, parsed.signature);

  if (!isValid) {
    const error = new SignatureVerificationError(
      "Shopify signature verification failed: signature does not match expected HMAC",
    );

    return failVerification(rawBody, error, options.throwOnError);
  }

  const payload =
    options.parseJson !== false ? tryParseJson<T>(rawBody) : undefined;
  const eventId = resolveWebhookEventId(
    {
      eventId: options.eventId,
      headers: options.headers,
      body: options.body,
      payload,
      rawBody,
    },
    SHOPIFY_EVENT_ID_HEADERS,
  );
  const replayError = await checkAndRecordReplay({
    store: options.store,
    eventId,
    storeTtlSeconds: options.storeTtlSeconds,
    toleranceSeconds: options.toleranceSeconds,
  });

  if (replayError) {
    return failVerification(
      rawBody,
      replayError,
      options.throwOnError,
      undefined,
      eventId,
    );
  }

  return {
    valid: true,
    rawBody,
    eventId,
    payload: payload as T,
  };
}

/**
 * Asserts that a Shopify webhook payload signature is valid, throwing on verification failure.
 *
 * @param options - Shopify verification options.
 * @returns Parsed and typed event payload.
 * @throws {SignatureVerificationError} If signature verification fails.
 * @throws {InvalidSignatureHeaderError} If header format is invalid or missing.
 */
export async function assertShopifyWebhook<T = ShopifyWebhookEvent>(
  options: ShopifyVerifyOptions,
): Promise<T> {
  const result = await verifyShopifyWebhook<T>({
    ...options,
    throwOnError: true,
  });

  return result.payload as T;
}

/**
 * Webhook provider plugin for Shopify.
 */
export const shopifyPlugin: WebhookProviderPlugin<
  ShopifyWebhookEvent,
  ShopifyVerifyOptions
> = {
  name: "shopify",
  verify: verifyShopifyWebhook,
};
