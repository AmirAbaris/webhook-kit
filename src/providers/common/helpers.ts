import type { WebhookKitError } from "../../errors.js";
import type { WebhookVerificationResult } from "../../types.js";

/**
 * Constructs a failed WebhookVerificationResult or throws if throwOnError is set.
 *
 * @param rawBody - Raw body string.
 * @param error - WebhookKitError instance.
 * @param throwOnError - Optional flag to throw immediately.
 * @param timestamp - Optional parsed timestamp.
 * @param eventId - Optional webhook event ID.
 * @returns Failed verification result.
 */
export function failVerification(
  rawBody: string,
  error: WebhookKitError,
  throwOnError?: boolean,
  timestamp?: number,
  eventId?: string,
): WebhookVerificationResult<never> {
  if (throwOnError) {
    throw error;
  }

  return {
    valid: false,
    rawBody,
    timestamp,
    eventId,
    error,
  };
}

/**
 * Attempts to parse the raw body as JSON.
 *
 * @param rawBody - Raw body payload string.
 * @returns Parsed payload or undefined.
 */
export function tryParseJson<T>(rawBody: string): T | undefined {
  try {
    return JSON.parse(rawBody) as T;
  } catch {
    // WHY: Silently ignore JSON parse errors when rawBody is not valid JSON
    // so verification succeeds if HMAC signature is valid.
    return undefined;
  }
}
