/**
 * Base error class for all webhook-kit errors.
 */
export class WebhookKitError extends Error {
  public readonly code: string;

  constructor(message: string, code = "WEBHOOK_KIT_ERROR") {
    super(message);
    this.name = "WebhookKitError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown or returned when signature verification fails (e.g. invalid HMAC or mismatched hash).
 */
export class SignatureVerificationError extends WebhookKitError {
  constructor(
    message = "Signature verification failed: signature does not match expected HMAC",
  ) {
    super(message, "SIGNATURE_VERIFICATION_FAILED");
    this.name = "SignatureVerificationError";
  }
}

/**
 * Thrown when the signature header is missing or malformed.
 */
export class InvalidSignatureHeaderError extends WebhookKitError {
  constructor(message = "Invalid or missing signature header") {
    super(message, "INVALID_SIGNATURE_HEADER");
    this.name = "InvalidSignatureHeaderError";
  }
}

/**
 * Thrown when the timestamp outside the allowed tolerance window (replay attack protection).
 */
export class TimestampToleranceError extends WebhookKitError {
  public readonly timestamp: number;
  public readonly toleranceSeconds: number;

  constructor(timestamp: number, toleranceSeconds: number, message?: string) {
    super(
      message ??
        `Timestamp outside tolerance window (timestamp: ${timestamp}, tolerance: ${toleranceSeconds}s)`,
      "TIMESTAMP_TOLERANCE_EXCEEDED",
    );
    this.name = "TimestampToleranceError";
    this.timestamp = timestamp;
    this.toleranceSeconds = toleranceSeconds;
  }
}

/**
 * Thrown when extracting raw payload from request or stream fails.
 */
export class PayloadExtractionError extends WebhookKitError {
  constructor(message = "Failed to extract raw body payload for verification") {
    super(message, "PAYLOAD_EXTRACTION_FAILED");
    this.name = "PayloadExtractionError";
  }
}

/**
 * Thrown or returned when a webhook event ID has already been processed in the replay store.
 */
export class ReplayAttackError extends WebhookKitError {
  public readonly eventId: string;

  constructor(eventId: string, message?: string) {
    super(
      message ??
        `Duplicate webhook event rejected (replay protection): event "${eventId}" was already processed`,
      "WEBHOOK_REPLAY_DETECTED",
    );
    this.name = "ReplayAttackError";
    this.eventId = eventId;
  }
}
