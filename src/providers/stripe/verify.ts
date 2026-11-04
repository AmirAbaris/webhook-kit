import { computeSubtleHmac } from "../../crypto/subtle.js";
import { SignatureVerificationError } from "../../errors.js";
import { checkAndRecordReplay, resolveWebhookEventId } from "../../store.js";
import type {
  WebhookProviderPlugin,
  WebhookVerificationResult,
} from "../../types.js";
import { extractRawBody } from "../../utils/extract-body.js";
import { failVerification, tryParseJson } from "../common/helpers.js";
import {
  checkStripeTolerance,
  matchesAnyStripeSignature,
  resolveStripeSignatureHeader,
  safeParseStripeHeader,
  STRIPE_EVENT_ID_HEADERS,
  validateStripePreconditions,
} from "./signature.js";
import type { StripeVerifyOptions, StripeWebhookEvent } from "./types.js";

/**
 * Verifies a Stripe webhook event signature.
 *
 * Stripe computes HMAC-SHA256 over `${timestamp}.${rawPayload}` and compares
 * against the `v1` signature tag in `Stripe-Signature`.
 *
 * @param options - Stripe verification options
 * @returns Verification result with typed payload
 */
export async function verifyStripeWebhook<T = StripeWebhookEvent>(
  options: StripeVerifyOptions,
): Promise<WebhookVerificationResult<T>> {
  const rawBody = await extractRawBody(options.body);
  const rawHeader = resolveStripeSignatureHeader(options);

  const preconditionError = validateStripePreconditions(options, rawHeader);

  if (preconditionError) {
    return failVerification(rawBody, preconditionError, options.throwOnError);
  }

  const parsedHeader = safeParseStripeHeader(rawHeader!);

  if ("error" in parsedHeader) {
    return failVerification(rawBody, parsedHeader.error, options.throwOnError);
  }

  const { timestamp, signatures } = parsedHeader;
  const toleranceError = checkStripeTolerance(timestamp, options);

  if (toleranceError) {
    return failVerification(
      rawBody,
      toleranceError,
      options.throwOnError,
      timestamp,
    );
  }

  // WHY: Stripe computes HMAC-SHA256 over `${timestamp}.${rawBody}`
  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSig = await computeSubtleHmac(
    "SHA-256",
    options.secret,
    signedPayload,
    "hex",
  );

  const isValid = matchesAnyStripeSignature(expectedSig, signatures);

  if (!isValid) {
    const error = new SignatureVerificationError(
      "Stripe signature verification failed: signature does not match expected HMAC",
    );

    return failVerification(rawBody, error, options.throwOnError, timestamp);
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
    STRIPE_EVENT_ID_HEADERS,
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
      timestamp,
      eventId,
    );
  }

  return {
    valid: true,
    rawBody,
    timestamp,
    eventId,
    payload: payload as T,
  };
}

/**
 * Asserts that a Stripe webhook event signature is valid, throwing on verification failure.
 *
 * @param options - Stripe verification options.
 * @returns Parsed and typed event payload.
 * @throws {SignatureVerificationError} If signature verification fails.
 * @throws {TimestampToleranceError} If timestamp falls outside the tolerance window.
 * @throws {InvalidSignatureHeaderError} If header format is invalid or missing.
 */
export async function assertStripeWebhook<T = StripeWebhookEvent>(
  options: StripeVerifyOptions,
): Promise<T> {
  const result = await verifyStripeWebhook<T>({
    ...options,
    throwOnError: true,
  });

  return result.payload as T;
}

/**
 * Webhook provider plugin for Stripe.
 */
export const stripePlugin: WebhookProviderPlugin<
  StripeWebhookEvent,
  StripeVerifyOptions
> = {
  name: "stripe",
  verify: verifyStripeWebhook,
};
