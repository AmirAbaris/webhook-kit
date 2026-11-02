import type { WebhookKitError } from "./errors.js";

/**
 * Supported raw body representations across runtimes (Node, Edge, Browser, Bun, Deno).
 */
export type RawBody =
  | string
  | Uint8Array
  | ArrayBuffer
  | ArrayBufferView
  | ReadableStream<Uint8Array>
  | Request;

/**
 * Standard or framework headers representation.
 */
export type HeaderRecord =
  Record<string, string | string[] | undefined> | Headers;

/**
 * Supported HMAC cryptographic algorithms in Web Cryptography API.
 */
export type SupportedAlgorithm = "SHA-256" | "SHA-384" | "SHA-512" | "SHA-1";

/**
 * Built-in webhook provider names supported by the unified verification API.
 */
export type BuiltinProviderName = "stripe" | "github" | "shopify";

/**
 * Options for generic or provider-specific webhook signature verification.
 */
export interface WebhookVerifyOptions {
  /**
   * The raw incoming body (Request, string, buffer, or stream).
   * MUST NOT be pre-parsed JSON.
   */
  body: RawBody;

  /**
   * Signature string provided in the webhook header.
   * Optional when `headers` or a `Request` `body` containing the signature header is passed.
   */
  signature?: string;

  /**
   * Shared secret key or signing secret.
   */
  secret: string | Uint8Array;

  /**
   * Optional built-in provider name ('stripe', 'github', 'shopify') or custom provider plugin.
   * When omitted, generic HMAC verification is performed.
   */
  provider?: BuiltinProviderName | WebhookProviderPlugin<unknown, never>;

  /**
   * Cryptographic hash algorithm for generic HMAC verification. Defaults to 'SHA-256'.
   */
  algorithm?: SupportedAlgorithm;

  /**
   * Signature digest encoding for generic HMAC verification. Defaults to 'hex'.
   */
  encoding?: "hex" | "base64";

  /**
   * Optional incoming HTTP headers if provider or generic verifier requires extracting metadata.
   */
  headers?: HeaderRecord;

  /**
   * Maximum allowed age of the webhook in seconds to mitigate replay attacks.
   */
  toleranceSeconds?: number;

  /**
   * Timestamp extracted from header or options (Unix seconds).
   */
  timestamp?: number | string;

  /**
   * Current Unix timestamp in seconds (defaults to Math.floor(Date.now() / 1000)).
   * Useful for deterministic testing.
   */
  currentTimestamp?: number;

  /**
   * Whether to automatically parse the verified body as JSON. Defaults to true.
   */
  parseJson?: boolean;

  /**
   * If true, throws a WebhookKitError on failure instead of returning `{ valid: false, error }`.
   */
  throwOnError?: boolean;
}

/**
 * Successful outcome returned by verification operations.
 */
export interface WebhookVerificationSuccess<T = unknown> {
  /**
   * True when signature matches and all validations (e.g. timestamp) passed.
   */
  valid: true;

  /**
   * Exact raw body string used in the HMAC calculation.
   */
  rawBody: string;

  /**
   * Typed parsed JSON payload (or undefined if parseJson is false or body is non-JSON).
   */
  payload: T;

  /**
   * Verified timestamp if present in the signature header or options.
   */
  timestamp?: number;

  /**
   * Undefined on successful verification.
   */
  error?: undefined;
}

/**
 * Failed outcome returned by verification operations.
 */
export interface WebhookVerificationFailure {
  /**
   * False when signature or timestamp validation failed.
   */
  valid: false;

  /**
   * Exact raw body string used in the HMAC calculation.
   */
  rawBody: string;

  /**
   * Undefined on failed verification.
   */
  payload?: undefined;

  /**
   * Extracted timestamp if parsed prior to failure.
   */
  timestamp?: number;

  /**
   * Verification error details explaining the failure.
   */
  error: WebhookKitError;
}

/**
 * Discriminated union outcome returned by verification operations.
 * Narrowing via `if (result.valid)` narrows `result.payload` to `T`,
 * while `if (!result.valid)` narrows `result.error` to `WebhookKitError`.
 */
export type WebhookVerificationResult<T = unknown> =
  WebhookVerificationSuccess<T> | WebhookVerificationFailure;

/**
 * Interface for extensible provider plugins (Stripe, GitHub, Shopify, etc.).
 */
export interface WebhookProviderPlugin<TPayload = unknown, TOptions = unknown> {
  /**
   * Unique name of the provider plugin (e.g. 'stripe', 'github', 'shopify').
   */
  readonly name: string;

  /**
   * Verify an incoming webhook for this specific provider format.
   */
  verify(options: TOptions): Promise<WebhookVerificationResult<TPayload>>;
}
