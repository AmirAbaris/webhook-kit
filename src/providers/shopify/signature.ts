import {
  InvalidSignatureHeaderError,
  SignatureVerificationError,
  WebhookKitError,
} from "../../errors.js";
import { extractHeaderValue } from "../../utils/headers.js";
import { assertNonEmptyHeader } from "../common/assertions.js";
import type { ShopifyVerifyOptions } from "./types.js";

export const BASE64_REGEX =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export const SHOPIFY_EVENT_ID_HEADERS = [
  "x-shopify-webhook-id",
  "x-webhook-id",
  "webhook-id",
] as const;

/**
 * Parses an `X-Shopify-Hmac-Sha256` header, validating and normalizing the Base64 signature.
 *
 * @param header - Raw `X-Shopify-Hmac-Sha256` Base64 header string.
 * @returns Normalized Base64-encoded HMAC-SHA256 signature string.
 * @throws {InvalidSignatureHeaderError} If header is missing, empty, or not valid Base64.
 */
export function parseShopifySignature(header: string): string {
  assertNonEmptyHeader(header, "Missing or empty X-Shopify-Hmac-Sha256 header");

  const trimmed = header.trim();

  // WHY: Validate strict 44-character Base64 structure for 32-byte HMAC-SHA256 digests
  // before cryptographic comparison so malformed or truncated headers fail fast with InvalidSignatureHeaderError.
  if (trimmed.length !== 44 || !BASE64_REGEX.test(trimmed)) {
    throw new InvalidSignatureHeaderError(
      "Invalid X-Shopify-Hmac-Sha256 header format: expected 44-character Base64-encoded SHA-256 digest",
    );
  }

  return trimmed;
}

/**
 * Resolves the raw signature header string from options, headers record, or request.
 *
 * @param options - Shopify verification options.
 * @returns Shopify signature header string or undefined if not found.
 */
export function resolveShopifySignatureHeader(
  options: ShopifyVerifyOptions,
): string | undefined {
  if (options.signature) {
    return options.signature;
  }

  if (options.headers) {
    return extractHeaderValue(options.headers, "x-shopify-hmac-sha256");
  }

  if (typeof Request !== "undefined" && options.body instanceof Request) {
    return options.body.headers.get("x-shopify-hmac-sha256") ?? undefined;
  }

  return undefined;
}

/**
 * Validates preconditions for Shopify webhook verification.
 *
 * @param options - Shopify verification options.
 * @param rawHeader - Resolved header string.
 * @returns Error if preconditions fail, null otherwise.
 */
export function validateShopifyPreconditions(
  options: ShopifyVerifyOptions,
  rawHeader: string | undefined,
): WebhookKitError | null {
  if (!options.secret) {
    return new SignatureVerificationError(
      "Missing Shopify webhook signing secret",
    );
  }

  if (!rawHeader) {
    return new InvalidSignatureHeaderError(
      "Missing X-Shopify-Hmac-Sha256 header",
    );
  }

  return null;
}

/**
 * Safely parses the raw signature header without uncaught exceptions.
 *
 * @param rawHeader - Raw header string.
 * @returns Extracted Base64 signature string or error object.
 */
export function safeParseShopifyHeader(
  rawHeader: string,
): { signature: string } | { error: WebhookKitError } {
  try {
    const signature = parseShopifySignature(rawHeader);

    return { signature };
  } catch (err) {
    return {
      error:
        err instanceof WebhookKitError
          ? err
          : new InvalidSignatureHeaderError(String(err)),
    };
  }
}
