import { computeSubtleHmac, timingSafeEqual } from "../crypto/subtle.js";
import {
  InvalidSignatureHeaderError,
  SignatureVerificationError,
  WebhookKitError,
} from "../errors.js";
import type {
  HeaderRecord,
  WebhookProviderPlugin,
  WebhookVerificationResult,
} from "../types.js";
import { extractRawBody } from "../utils/extract-body.js";
import type { ProviderVerifyOptions } from "./types.js";

const BASE64_REGEX =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

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

/**
 * Asserts that a header value is a non-empty string.
 *
 * @param header - Candidate header value.
 */
function assertNonEmptyHeader(header: unknown): asserts header is string {
  if (typeof header !== "string" || !header.trim()) {
    throw new InvalidSignatureHeaderError(
      "Missing or empty X-Shopify-Hmac-Sha256 header",
    );
  }
}

/**
 * Parses an `X-Shopify-Hmac-Sha256` header, validating and normalizing the Base64 signature.
 *
 * @param header - Raw `X-Shopify-Hmac-Sha256` Base64 header string.
 * @returns Normalized Base64-encoded HMAC-SHA256 signature string.
 * @throws {InvalidSignatureHeaderError} If header is missing, empty, or not valid Base64.
 */
export function parseShopifySignature(header: string): string {
  assertNonEmptyHeader(header);

  const trimmed = header.trim();

  // WHY: Validate strict Base64 structure before cryptographic comparison so malformed
  // or non-Base64 headers fail fast with InvalidSignatureHeaderError.
  if (!BASE64_REGEX.test(trimmed)) {
    throw new InvalidSignatureHeaderError(
      "Invalid X-Shopify-Hmac-Sha256 header format: expected Base64-encoded string",
    );
  }

  return trimmed;
}

/**
 * Case-insensitively extracts a header value from a `Headers` instance or plain record.
 *
 * @param headers - Web standard `Headers` instance or record.
 * @param targetName - Lowercase target header name.
 * @returns Header value string or undefined.
 */
function extractHeaderValue(
  headers: HeaderRecord,
  targetName: string,
): string | undefined {
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return headers.get(targetName) ?? undefined;
  }

  const record = headers as Record<string, string | string[] | undefined>;
  const lowerTarget = targetName.toLowerCase();

  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === lowerTarget) {
      const value = record[key];

      return Array.isArray(value) ? value[0] : value;
    }
  }

  return undefined;
}

/**
 * Resolves the raw signature header string from options, headers record, or request.
 *
 * @param options - Shopify verification options.
 * @returns Shopify signature header string or undefined if not found.
 */
function resolveSignatureHeader(
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
function validatePreconditions(
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
function safeParseHeader(
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

/**
 * Constructs a failed WebhookVerificationResult or throws if throwOnError is set.
 *
 * @param rawBody - Raw body string.
 * @param error - WebhookKitError instance.
 * @param throwOnError - Optional flag to throw immediately.
 * @returns Failed verification result.
 */
function failVerification(
  rawBody: string,
  error: WebhookKitError,
  throwOnError?: boolean,
): WebhookVerificationResult<never> {
  if (throwOnError) {
    throw error;
  }

  return {
    valid: false,
    rawBody,
    error,
  };
}

/**
 * Attempts to parse the raw body as JSON.
 *
 * @param rawBody - Raw body payload string.
 * @returns Parsed payload or undefined.
 */
function tryParseJson<T>(rawBody: string): T | undefined {
  try {
    return JSON.parse(rawBody) as T;
  } catch {
    // WHY: Silently ignore JSON parse errors when rawBody is not valid JSON
    // so verification succeeds if HMAC signature is valid.
    return undefined;
  }
}

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
  const rawHeader = resolveSignatureHeader(options);

  const preconditionError = validatePreconditions(options, rawHeader);

  if (preconditionError) {
    return failVerification(rawBody, preconditionError, options.throwOnError);
  }

  const parsed = safeParseHeader(rawHeader!);

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

  return {
    valid: true,
    rawBody,
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
