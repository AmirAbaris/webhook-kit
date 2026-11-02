import { computeSubtleHmac, timingSafeEqual } from "../crypto/subtle.js";
import {
  InvalidSignatureHeaderError,
  SignatureVerificationError,
  TimestampToleranceError,
  WebhookKitError,
} from "../errors.js";
import type {
  HeaderRecord,
  WebhookProviderPlugin,
  WebhookVerificationResult,
} from "../types.js";
import { extractRawBody } from "../utils/extract-body.js";
import type { ProviderVerifyOptions } from "./types.js";

/**
 * Parsed components of a `Stripe-Signature` header.
 */
export interface StripeParsedSignatureHeader {
  /**
   * Extracted Unix timestamp in seconds.
   */
  timestamp: number;

  /**
   * One or more valid v1 HMAC-SHA256 signatures.
   */
  signatures: string[];

  /**
   * Optional v0 legacy signatures if present.
   */
  v0Signatures?: string[];
}

/**
 * Standard shape of a Stripe Webhook Event payload.
 */
export interface StripeWebhookEvent {
  id: string;
  object: string;
  type: string;
  created: number;
  data: {
    object: Record<string, unknown>;
    [key: string]: unknown;
  };
  livemode?: boolean;
  pending_webhooks?: number;
  request?: {
    id: string | null;
    idempotency_key: string | null;
  };
  [key: string]: unknown;
}

/**
 * Options for Stripe webhook verification.
 */
export interface StripeVerifyOptions extends ProviderVerifyOptions {
  /**
   * Stripe-Signature header format: `t=1492774577,v1=5257a869e7ecebeda32affa62cd4923...`
   */
  signature?: string;

  /**
   * Timestamp tolerance window in seconds (Stripe default is 300s).
   * Pass 0 to disable replay protection check.
   */
  toleranceSeconds?: number;

  /**
   * Current Unix timestamp in seconds (defaults to Math.floor(Date.now() / 1000)).
   * Useful for deterministic testing.
   */
  currentTimestamp?: number;

  /**
   * If true, throws errors rather than returning `{ valid: false, error }`.
   */
  throwOnError?: boolean;
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
 * @param options - Stripe verification options.
 * @returns Stripe signature header string or undefined if not found.
 */
function resolveSignatureHeader(
  options: StripeVerifyOptions,
): string | undefined {
  if (options.signature) {
    return options.signature;
  }

  if (options.headers) {
    return extractHeaderValue(options.headers, "stripe-signature");
  }

  if (typeof Request !== "undefined" && options.body instanceof Request) {
    return options.body.headers.get("stripe-signature") ?? undefined;
  }

  return undefined;
}

/**
 * Splits a header tag pair into key and value.
 *
 * @param item - Header entry (e.g. `t=1492774577` or `v1=...`).
 * @returns Key-value tuple or null if malformed.
 */
function parseKeyValue(item: string): [string, string] | null {
  const trimmed = item.trim();
  const eqIndex = trimmed.indexOf("=");

  if (eqIndex === -1) {
    return null;
  }

  return [trimmed.slice(0, eqIndex).trim(), trimmed.slice(eqIndex + 1).trim()];
}

/**
 * Processes a single parsed tag from the Stripe signature header into accumulator state.
 *
 * @param key - Tag key (e.g. `'t'`, `'v1'`, `'v0'`).
 * @param value - Tag value string.
 * @param state - Mutable parsing state.
 */
function processHeaderTag(
  key: string,
  value: string,
  state: {
    timestamp?: number;
    signatures: string[];
    v0Signatures: string[];
  },
): void {
  if (!value) {
    return;
  }

  if (key === "v1") {
    state.signatures.push(value);

    return;
  }

  if (key === "v0") {
    state.v0Signatures.push(value);

    return;
  }

  if (key === "t") {
    const parsed = parseInt(value, 10);
    // WHY: Verify integer validity to avoid NaN propagation during timestamp comparison.
    if (Number.isInteger(parsed) && parsed > 0) {
      state.timestamp = parsed;
    }
  }
}

/**
 * Asserts that a header value is a non-empty string.
 *
 * @param header - Candidate header value.
 */
function assertNonEmptyHeader(header: unknown): asserts header is string {
  if (typeof header !== "string" || !header.trim()) {
    throw new InvalidSignatureHeaderError(
      "Missing or empty Stripe-Signature header",
    );
  }
}

/**
 * Collects timestamp and signature schemes across comma-separated header entries.
 *
 * @param header - Non-empty header string.
 * @returns Parsed mutable state accumulator.
 */
function collectHeaderState(header: string): {
  timestamp?: number;
  signatures: string[];
  v0Signatures: string[];
} {
  const state: {
    timestamp?: number;
    signatures: string[];
    v0Signatures: string[];
  } = {
    signatures: [],
    v0Signatures: [],
  };

  const items = header.split(",");

  for (const item of items) {
    const pair = parseKeyValue(item);

    if (pair) {
      processHeaderTag(pair[0], pair[1], state);
    }
  }

  return state;
}

/**
 * Validates that parsed header state satisfies Stripe protocol requirements.
 *
 * @param timestamp - Extracted Unix timestamp.
 * @param signaturesCount - Count of valid v1 signatures.
 */
function validateParsedState(
  timestamp?: number,
  signaturesCount?: number,
): void {
  if (timestamp === undefined) {
    throw new InvalidSignatureHeaderError(
      "Stripe-Signature header missing or invalid timestamp (t=...)",
    );
  }

  // WHY: Stripe requires at least one v1 signature scheme to mitigate downgrade attacks.
  if (!signaturesCount) {
    throw new InvalidSignatureHeaderError(
      "Stripe-Signature header missing valid v1 signature scheme (v1=...)",
    );
  }
}

/**
 * Parses a Stripe signature header string (`t=...,v1=...,v0=...`).
 *
 * @param header - Raw `Stripe-Signature` header string.
 * @returns Parsed header components including timestamp and signatures.
 * @throws {InvalidSignatureHeaderError} If header format is invalid or missing required tags.
 */
export function parseStripeSignature(
  header: string,
): StripeParsedSignatureHeader {
  assertNonEmptyHeader(header);

  const state = collectHeaderState(header);

  validateParsedState(state.timestamp, state.signatures.length);

  return {
    timestamp: state.timestamp!,
    signatures: state.signatures,
    v0Signatures: state.v0Signatures.length ? state.v0Signatures : undefined,
  };
}

/**
 * Validates that a webhook timestamp falls within the allowed tolerance window.
 *
 * @param timestamp - Unix timestamp in seconds from the signature header.
 * @param toleranceSeconds - Maximum allowed drift/age in seconds (default: 300s). Pass 0 to disable.
 * @param currentTimestamp - Optional current Unix timestamp in seconds (defaults to now).
 * @throws {TimestampToleranceError} If timestamp falls outside the tolerance window.
 */
export function validateTimestampTolerance(
  timestamp: number,
  toleranceSeconds = 300,
  currentTimestamp?: number,
): void {
  // WHY: Setting tolerance <= 0 explicitly disables replay protection.
  if (toleranceSeconds <= 0) {
    return;
  }

  const now = currentTimestamp ?? Math.floor(Date.now() / 1000);
  const diff = Math.abs(now - timestamp);

  if (diff > toleranceSeconds) {
    throw new TimestampToleranceError(timestamp, toleranceSeconds);
  }
}

/**
 * Compares an expected HMAC hex signature against candidate signatures in constant time.
 *
 * @param expectedSignature - Computed hex signature.
 * @param candidates - List of candidate hex signatures from the header.
 * @returns `true` if any candidate matches the expected signature.
 */
function matchesAnySignature(
  expectedSignature: string,
  candidates: string[],
): boolean {
  let matched = false;

  for (const candidate of candidates) {
    // WHY: Use timingSafeEqual on each candidate to protect against side-channel timing leaks.
    if (timingSafeEqual(expectedSignature, candidate)) {
      matched = true;
    }
  }

  return matched;
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
    // so verifyStripeWebhook succeeds if signature is valid.
    return undefined;
  }
}

/**
 * Validates preconditions for Stripe webhook verification.
 *
 * @param options - Stripe verification options.
 * @param rawHeader - Resolved header string.
 * @returns Error if preconditions fail, null otherwise.
 */
function validatePreconditions(
  options: StripeVerifyOptions,
  rawHeader: string | undefined,
): WebhookKitError | null {
  if (!options.secret) {
    return new SignatureVerificationError(
      "Missing Stripe webhook signing secret",
    );
  }

  if (!rawHeader) {
    return new InvalidSignatureHeaderError("Missing Stripe-Signature header");
  }

  return null;
}

/**
 * Safely parses the raw signature header without uncaught exceptions.
 *
 * @param rawHeader - Raw header string.
 * @returns Parsed header or error object.
 */
function safeParseHeader(
  rawHeader: string,
): StripeParsedSignatureHeader | { error: WebhookKitError } {
  try {
    return parseStripeSignature(rawHeader);
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
 * Checks timestamp tolerance, returning an error if tolerance window is exceeded.
 *
 * @param timestamp - Unix timestamp in seconds.
 * @param options - Stripe verification options.
 * @returns TimestampToleranceError if exceeded, null otherwise.
 */
function checkTolerance(
  timestamp: number,
  options: StripeVerifyOptions,
): TimestampToleranceError | null {
  const tolerance = options.toleranceSeconds ?? 300;

  try {
    validateTimestampTolerance(timestamp, tolerance, options.currentTimestamp);

    return null;
  } catch (err) {
    return err instanceof TimestampToleranceError
      ? err
      : new TimestampToleranceError(timestamp, tolerance);
  }
}

/**
 * Constructs a failed WebhookVerificationResult or throws if throwOnError is set.
 *
 * @param rawBody - Raw body string.
 * @param error - WebhookKitError instance.
 * @param throwOnError - Optional flag to throw immediately.
 * @param timestamp - Optional parsed timestamp.
 * @returns Failed verification result.
 */
function failVerification(
  rawBody: string,
  error: WebhookKitError,
  throwOnError?: boolean,
  timestamp?: number,
): WebhookVerificationResult<never> {
  if (throwOnError) {
    throw error;
  }

  return {
    valid: false,
    rawBody,
    timestamp,
    error,
  };
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
export async function verifyStripeWebhook<T = StripeWebhookEvent>(
  options: StripeVerifyOptions,
): Promise<WebhookVerificationResult<T>> {
  const rawBody = await extractRawBody(options.body);
  const rawHeader = resolveSignatureHeader(options);

  const preconditionError = validatePreconditions(options, rawHeader);

  if (preconditionError) {
    return failVerification(rawBody, preconditionError, options.throwOnError);
  }

  const parsedHeader = safeParseHeader(rawHeader!);

  if ("error" in parsedHeader) {
    return failVerification(rawBody, parsedHeader.error, options.throwOnError);
  }

  const { timestamp, signatures } = parsedHeader;
  const toleranceError = checkTolerance(timestamp, options);

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

  const isValid = matchesAnySignature(expectedSig, signatures);

  if (!isValid) {
    const error = new SignatureVerificationError(
      "Stripe signature verification failed: signature does not match expected HMAC",
    );

    return failVerification(rawBody, error, options.throwOnError, timestamp);
  }

  const payload =
    options.parseJson !== false ? tryParseJson<T>(rawBody) : undefined;

  return {
    valid: true,
    rawBody,
    timestamp,
    payload,
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
