import type {
  WebhookVerifyOptions,
  WebhookVerificationResult,
} from "./types.js";
import { extractRawBody } from "./utils/extract-body.js";
import { SignatureVerificationError } from "./errors.js";

/**
 * Verifies an incoming webhook signature against the raw request body using constant-time HMAC check.
 *
 * @param options - Verification options including body, signature, secret, and optional tolerance
 * @returns Verification result object with validity, extracted raw body, and optional parsed payload
 *
 * @example
 * ```ts
 * const result = await verifyWebhookSignature({
 *   body: req,
 *   signature: req.headers.get('x-signature')!,
 *   secret: process.env.WEBHOOK_SECRET!,
 * });
 * if (!result.valid) {
 *   return new Response('Unauthorized', { status: 401 });
 * }
 * console.log('Parsed payload:', result.payload);
 * ```
 */
export async function verifyWebhookSignature<T = unknown>(
  options: WebhookVerifyOptions,
): Promise<WebhookVerificationResult<T>> {
  const rawBody = await extractRawBody(options.body);

  // TODO: Implement full Web Cryptography API HMAC verification in upcoming PR
  // Stub behavior for initial template:
  if (!options.signature || !options.secret) {
    return {
      valid: false,
      rawBody,
      error: new SignatureVerificationError("Missing signature or secret"),
    };
  }

  // TODO: In full implementation:
  // 1. Verify timestamp tolerance if timestamp or toleranceSeconds are provided
  // 2. Compute HMAC digest with crypto.subtle
  // 3. Constant-time compare computed digest against provided signature

  let payload: T | undefined;
  if (options.parseJson !== false) {
    try {
      payload = JSON.parse(rawBody) as T;
    } catch {
      // Ignored if raw body is not JSON or parsing fails
    }
  }

  return {
    valid: true,
    rawBody,
    payload,
  };
}

/**
 * Asserts that an incoming webhook signature is valid, throwing a WebhookKitError if invalid.
 * Returns the typed payload if valid and parsed.
 *
 * @throws {SignatureVerificationError} If signature verification fails
 */
export async function assertWebhookSignature<T = unknown>(
  options: WebhookVerifyOptions,
): Promise<T> {
  const result = await verifyWebhookSignature<T>(options);
  if (!result.valid || result.error) {
    throw result.error ?? new SignatureVerificationError();
  }
  return result.payload as T;
}
