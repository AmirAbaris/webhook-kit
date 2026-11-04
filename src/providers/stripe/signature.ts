import {
  InvalidSignatureHeaderError,
  SignatureVerificationError,
  TimestampToleranceError,
  WebhookKitError,
} from "../../errors.js";
import { timingSafeEqual } from "../../crypto/subtle.js";
import { extractHeaderValue } from "../../utils/headers.js";
import { assertNonEmptyHeader } from "../common/assertions.js";
import type {
  StripeParsedSignatureHeader,
  StripeVerifyOptions,
} from "./types.js";

export const STRIPE_EVENT_ID_HEADERS = [
  "x-stripe-webhook-id",
  "x-webhook-id",
  "webhook-id",
] as const;

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
  assertNonEmptyHeader(header, "Missing or empty Stripe-Signature header");

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
 * Resolves the raw signature header string from options, headers record, or request.
 *
 * @param options - Stripe verification options.
 * @returns Stripe signature header string or undefined if not found.
 */
export function resolveStripeSignatureHeader(
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
 * Validates preconditions for Stripe webhook verification.
 *
 * @param options - Stripe verification options.
 * @param rawHeader - Resolved header string.
 * @returns Error if preconditions fail, null otherwise.
 */
export function validateStripePreconditions(
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
export function safeParseStripeHeader(
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
export function checkStripeTolerance(
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
 * Compares an expected HMAC hex signature against candidate signatures in constant time.
 *
 * @param expectedSignature - Computed hex signature.
 * @param candidates - List of candidate hex signatures from the header.
 * @returns `true` if any candidate matches the expected signature.
 */
export function matchesAnyStripeSignature(
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
