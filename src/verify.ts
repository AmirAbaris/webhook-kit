import { computeSubtleHmac, timingSafeEqual } from "./crypto/subtle.js";
import {
  SignatureVerificationError,
  TimestampToleranceError,
  WebhookKitError,
} from "./errors.js";
import { githubPlugin, type GithubWebhookEvent } from "./providers/github.js";
import {
  shopifyPlugin,
  type ShopifyWebhookEvent,
} from "./providers/shopify.js";
import {
  stripePlugin,
  type StripeWebhookEvent,
  validateTimestampTolerance,
} from "./providers/stripe.js";
import type {
  BuiltinProviderName,
  HeaderRecord,
  WebhookProviderPlugin,
  WebhookVerificationResult,
  WebhookVerifyOptions,
} from "./types.js";
import { extractRawBody } from "./utils/extract-body.js";

const GENERIC_SIGNATURE_HEADERS = [
  "x-webhook-signature",
  "x-signature",
  "x-hub-signature-256",
  "stripe-signature",
  "x-shopify-hmac-sha256",
] as const;

const GENERIC_TIMESTAMP_HEADERS = [
  "x-webhook-timestamp",
  "x-timestamp",
  "webhook-timestamp",
] as const;

const HEX_SCHEME_PREFIX_REGEX = /^(?:sha-?(?:256|384|512|1)|v1)=/i;

/**
 * Built-in provider plugin registry keyed by lowercase provider name.
 */
export const PROVIDER_REGISTRY: Record<
  BuiltinProviderName,
  WebhookProviderPlugin<unknown, never>
> = {
  stripe: stripePlugin as WebhookProviderPlugin<unknown, never>,
  github: githubPlugin as WebhookProviderPlugin<unknown, never>,
  shopify: shopifyPlugin as WebhookProviderPlugin<unknown, never>,
};

/**
 * Case-insensitively extracts a single header value from a `Headers` instance or plain record.
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
 * Searches a list of candidate header names in a `Headers` or record object.
 *
 * @param headers - Headers source.
 * @param candidateNames - Ordered list of lowercase header names to check.
 * @returns First matching non-empty header value or undefined.
 */
function findFirstHeader(
  headers: HeaderRecord | undefined,
  candidateNames: readonly string[],
): string | undefined {
  if (!headers) {
    return undefined;
  }

  for (const name of candidateNames) {
    const val = extractHeaderValue(headers, name);

    if (val) {
      return val;
    }
  }

  return undefined;
}

/**
 * Resolves the signature string from explicit options, headers record, or a `Request` body.
 *
 * @param options - Verification options.
 * @returns Resolved signature string or undefined.
 */
function resolveGenericSignature(
  options: WebhookVerifyOptions,
): string | undefined {
  if (options.signature) {
    return options.signature;
  }

  const fromHeaders = findFirstHeader(
    options.headers,
    GENERIC_SIGNATURE_HEADERS,
  );

  if (fromHeaders) {
    return fromHeaders;
  }

  if (typeof Request !== "undefined" && options.body instanceof Request) {
    return findFirstHeader(options.body.headers, GENERIC_SIGNATURE_HEADERS);
  }

  return undefined;
}

/**
 * Resolves an optional timestamp value from explicit options, headers record, or a `Request` body.
 *
 * @param options - Verification options.
 * @returns Raw timestamp value or undefined.
 */
function resolveRawTimestamp(
  options: WebhookVerifyOptions,
): number | string | undefined {
  if (options.timestamp !== undefined) {
    return options.timestamp;
  }

  const fromHeaders = findFirstHeader(
    options.headers,
    GENERIC_TIMESTAMP_HEADERS,
  );

  if (fromHeaders !== undefined) {
    return fromHeaders;
  }

  if (typeof Request !== "undefined" && options.body instanceof Request) {
    return findFirstHeader(options.body.headers, GENERIC_TIMESTAMP_HEADERS);
  }

  return undefined;
}

/**
 * Parses a raw timestamp number or string into a positive integer Unix timestamp.
 *
 * @param rawTimestamp - Raw timestamp from options or headers.
 * @returns Positive integer timestamp or `null` if invalid.
 */
function parseTimestampValue(rawTimestamp: number | string): number | null {
  const parsed =
    typeof rawTimestamp === "number"
      ? rawTimestamp
      : parseInt(String(rawTimestamp).trim(), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

/**
 * Parses and validates an optional timestamp against the configured tolerance window.
 *
 * @param options - Verification options.
 * @returns Parsed timestamp or a `TimestampToleranceError`.
 */
function verifyGenericTimestamp(options: WebhookVerifyOptions): {
  timestamp?: number;
  error?: TimestampToleranceError;
} {
  const rawTimestamp = resolveRawTimestamp(options);

  if (rawTimestamp === undefined) {
    return {};
  }

  const parsed = parseTimestampValue(rawTimestamp);
  const tolerance = options.toleranceSeconds ?? 300;

  if (parsed === null) {
    return {
      error: new TimestampToleranceError(
        0,
        tolerance,
        "Invalid webhook timestamp header or option",
      ),
    };
  }

  try {
    validateTimestampTolerance(parsed, tolerance, options.currentTimestamp);

    return { timestamp: parsed };
  } catch (err) {
    return {
      error:
        err instanceof TimestampToleranceError
          ? err
          : new TimestampToleranceError(parsed, tolerance),
    };
  }
}

/**
 * Checks whether a secret string or byte array is non-empty.
 *
 * @param secret - Candidate secret key.
 * @returns `true` if secret is present and non-empty.
 */
function hasSecret(secret: string | Uint8Array | undefined): boolean {
  if (!secret) {
    return false;
  }

  return typeof secret === "string" ? secret.length > 0 : secret.byteLength > 0;
}

/**
 * Normalizes a candidate signature string according to the target encoding.
 *
 * @param signature - Raw signature string.
 * @param encoding - Digest encoding (`'hex'` or `'base64'`).
 * @returns Normalized signature string for constant-time comparison.
 */
function normalizeCandidateSignature(
  signature: string,
  encoding: "hex" | "base64",
): string {
  const trimmed = signature.trim();

  if (encoding === "base64") {
    return trimmed;
  }

  // WHY: Strip common scheme prefixes (e.g. 'sha256=', 'v1=') and lowercase hex
  // so generic HMAC verification works seamlessly across standard webhook formats.
  return trimmed.replace(HEX_SCHEME_PREFIX_REGEX, "").trim().toLowerCase();
}

/**
 * Computes a normalized HMAC digest string for comparison.
 *
 * @param options - Verification options.
 * @param data - Signing payload string.
 * @param encoding - Digest encoding (`'hex'` or `'base64'`).
 * @returns Normalized digest string.
 */
async function computeNormalizedDigest(
  options: WebhookVerifyOptions,
  data: string,
  encoding: "hex" | "base64",
): Promise<string> {
  const digest = await computeSubtleHmac(
    options.algorithm ?? "SHA-256",
    options.secret,
    data,
    encoding,
  );

  return encoding === "hex" ? digest.toLowerCase() : digest;
}

/**
 * Compares candidate signature against HMAC of rawBody (and `${timestamp}.${rawBody}` if timestamped).
 *
 * @param options - Verification options.
 * @param rawBody - Extracted raw body string.
 * @param rawSignature - Raw signature header or option.
 * @param timestamp - Optional validated Unix timestamp.
 * @returns `true` if signature matches expected HMAC.
 */
async function matchesGenericHmac(
  options: WebhookVerifyOptions,
  rawBody: string,
  rawSignature: string,
  timestamp?: number,
): Promise<boolean> {
  const encoding = options.encoding ?? "hex";
  const candidate = normalizeCandidateSignature(rawSignature, encoding);

  if (!candidate) {
    return false;
  }

  const rawExpected = await computeNormalizedDigest(options, rawBody, encoding);
  let matched = timingSafeEqual(rawExpected, candidate);

  if (timestamp !== undefined) {
    // WHY: Support both raw-body signing and `${timestamp}.${rawBody}` signing
    // when a timestamp is supplied in generic verification mode.
    const tsExpected = await computeNormalizedDigest(
      options,
      `${timestamp}.${rawBody}`,
      encoding,
    );

    if (timingSafeEqual(tsExpected, candidate)) {
      matched = true;
    }
  }

  return matched;
}

/**
 * Constructs a failed `WebhookVerificationResult` or throws if `throwOnError` is enabled.
 *
 * @param rawBody - Extracted raw body string.
 * @param error - `WebhookKitError` instance.
 * @param throwOnError - Whether to throw the error immediately.
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
 * Safely parses a raw body string as JSON, returning `undefined` on syntax errors.
 *
 * @param rawBody - Raw body string.
 * @returns Parsed JSON value or `undefined`.
 */
function tryParseJson<T>(rawBody: string): T | undefined {
  try {
    return JSON.parse(rawBody) as T;
  } catch {
    // WHY: Silently ignore JSON parse errors when rawBody is not valid JSON
    // so signature verification still succeeds for plain-text or form-encoded payloads.
    return undefined;
  }
}

/**
 * Executes a `WebhookProviderPlugin` and honors `options.throwOnError` if verification fails.
 *
 * @param plugin - Target webhook provider plugin.
 * @param options - Verification options.
 * @returns Provider verification result.
 */
async function runPluginVerification<T>(
  plugin: WebhookProviderPlugin<T, WebhookVerifyOptions>,
  options: WebhookVerifyOptions,
): Promise<WebhookVerificationResult<T>> {
  const result = await plugin.verify(options);

  if (!result.valid && options.throwOnError) {
    throw result.error;
  }

  return result;
}

/**
 * Delegates verification to a named built-in provider or custom `WebhookProviderPlugin`.
 *
 * @param options - Verification options containing `provider`.
 * @returns Provider verification result.
 */
async function delegateToProvider<T>(
  options: WebhookVerifyOptions,
): Promise<WebhookVerificationResult<T>> {
  const provider = options.provider!;

  if (typeof provider === "object") {
    return runPluginVerification(
      provider as WebhookProviderPlugin<T, WebhookVerifyOptions>,
      options,
    );
  }

  const normalizedName = String(provider)
    .toLowerCase()
    .trim() as BuiltinProviderName;
  const builtin = PROVIDER_REGISTRY[normalizedName];

  if (!builtin) {
    const rawBody = await extractRawBody(options.body);
    const error = new WebhookKitError(
      `Unsupported webhook provider: "${String(provider)}"`,
      "UNSUPPORTED_PROVIDER",
    );

    return failVerification(rawBody, error, options.throwOnError);
  }

  return runPluginVerification(
    builtin as WebhookProviderPlugin<T, WebhookVerifyOptions>,
    options,
  );
}

/**
 * Verifies a generic HMAC webhook signature when no specific provider plugin is selected.
 *
 * @param options - Generic verification options.
 * @returns Verification outcome with typed payload.
 */
async function verifyGenericWebhook<T>(
  options: WebhookVerifyOptions,
): Promise<WebhookVerificationResult<T>> {
  const rawBody = await extractRawBody(options.body);
  const rawSignature = resolveGenericSignature(options);

  if (!hasSecret(options.secret) || !rawSignature) {
    const error = new SignatureVerificationError("Missing signature or secret");

    return failVerification(rawBody, error, options.throwOnError);
  }

  const tsResult = verifyGenericTimestamp(options);

  if (tsResult.error) {
    return failVerification(rawBody, tsResult.error, options.throwOnError);
  }

  const isValid = await matchesGenericHmac(
    options,
    rawBody,
    rawSignature,
    tsResult.timestamp,
  );

  if (!isValid) {
    const error = new SignatureVerificationError();

    return failVerification(
      rawBody,
      error,
      options.throwOnError,
      tsResult.timestamp,
    );
  }

  const payload =
    options.parseJson !== false ? tryParseJson<T>(rawBody) : undefined;

  return {
    valid: true,
    rawBody,
    timestamp: tsResult.timestamp,
    payload: payload as T,
  };
}

/**
 * Verifies an incoming Stripe webhook signature via the unified verification API.
 */
export async function verifyWebhookSignature<T = StripeWebhookEvent>(
  options: WebhookVerifyOptions & { provider: "stripe" },
): Promise<WebhookVerificationResult<T>>;

/**
 * Verifies an incoming GitHub webhook signature via the unified verification API.
 */
export async function verifyWebhookSignature<T = GithubWebhookEvent>(
  options: WebhookVerifyOptions & { provider: "github" },
): Promise<WebhookVerificationResult<T>>;

/**
 * Verifies an incoming Shopify webhook signature via the unified verification API.
 */
export async function verifyWebhookSignature<T = ShopifyWebhookEvent>(
  options: WebhookVerifyOptions & { provider: "shopify" },
): Promise<WebhookVerificationResult<T>>;

/**
 * Verifies an incoming webhook signature using a custom `WebhookProviderPlugin`.
 */
export async function verifyWebhookSignature<T>(
  options: WebhookVerifyOptions & { provider: WebhookProviderPlugin<T, never> },
): Promise<WebhookVerificationResult<T>>;

/**
 * Verifies an incoming webhook signature against the raw request body using constant-time HMAC check.
 *
 * @param options - Verification options including body, signature, secret, and optional provider or tolerance
 * @returns Verification result object with validity, extracted raw body, and narrowed payload or error
 */
export async function verifyWebhookSignature<T = unknown>(
  options: WebhookVerifyOptions,
): Promise<WebhookVerificationResult<T>>;

export async function verifyWebhookSignature<T = unknown>(
  options: WebhookVerifyOptions,
): Promise<WebhookVerificationResult<T>> {
  if (options.provider !== undefined) {
    return delegateToProvider<T>(options);
  }

  return verifyGenericWebhook<T>(options);
}

/**
 * Asserts that an incoming Stripe webhook signature is valid, returning the typed payload or throwing.
 */
export async function assertWebhookSignature<T = StripeWebhookEvent>(
  options: WebhookVerifyOptions & { provider: "stripe" },
): Promise<T>;

/**
 * Asserts that an incoming GitHub webhook signature is valid, returning the typed payload or throwing.
 */
export async function assertWebhookSignature<T = GithubWebhookEvent>(
  options: WebhookVerifyOptions & { provider: "github" },
): Promise<T>;

/**
 * Asserts that an incoming Shopify webhook signature is valid, returning the typed payload or throwing.
 */
export async function assertWebhookSignature<T = ShopifyWebhookEvent>(
  options: WebhookVerifyOptions & { provider: "shopify" },
): Promise<T>;

/**
 * Asserts that an incoming webhook signature is valid using a custom `WebhookProviderPlugin`.
 */
export async function assertWebhookSignature<T>(
  options: WebhookVerifyOptions & { provider: WebhookProviderPlugin<T, never> },
): Promise<T>;

/**
 * Asserts that an incoming webhook signature is valid, throwing a `WebhookKitError` if invalid.
 * Returns the typed payload if valid and parsed.
 *
 * @throws {SignatureVerificationError} If signature verification fails
 * @throws {TimestampToleranceError} If timestamp tolerance is exceeded
 */
export async function assertWebhookSignature<T = unknown>(
  options: WebhookVerifyOptions,
): Promise<T>;

export async function assertWebhookSignature<T = unknown>(
  options: WebhookVerifyOptions,
): Promise<T> {
  const result = await verifyWebhookSignature<T>({
    ...options,
    throwOnError: true,
  });

  if (!result.valid) {
    throw result.error;
  }

  return result.payload;
}
