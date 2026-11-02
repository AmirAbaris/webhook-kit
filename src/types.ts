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
 * Options for generic webhook signature verification.
 */
export interface WebhookVerifyOptions {
  /**
   * The raw incoming body (Request, string, buffer, or stream).
   * MUST NOT be pre-parsed JSON.
   */
  body: RawBody;

  /**
   * Signature string provided in the webhook header.
   */
  signature: string;

  /**
   * Shared secret key or signing secret.
   */
  secret: string | Uint8Array;

  /**
   * Cryptographic hash algorithm. Defaults to 'SHA-256'.
   */
  algorithm?: SupportedAlgorithm;

  /**
   * Optional incoming HTTP headers if provider requires extracting metadata.
   */
  headers?: HeaderRecord;

  /**
   * Maximum allowed age of the webhook in seconds to mitigate replay attacks.
   */
  toleranceSeconds?: number;

  /**
   * Timestamp extracted from header or options.
   */
  timestamp?: number | string;

  /**
   * Whether to automatically parse the verified body as JSON. Defaults to true.
   */
  parseJson?: boolean;
}

/**
 * Structured outcome returned by verification operations.
 */
export interface WebhookVerificationResult<T = unknown> {
  /**
   * True if signature matches and all validations (e.g. timestamp) passed.
   */
  valid: boolean;

  /**
   * Exact raw body string used in the HMAC calculation.
   */
  rawBody: string;

  /**
   * Typed parsed JSON payload, if parseJson was enabled and verification passed.
   */
  payload?: T;

  /**
   * Verified timestamp if present in the signature header.
   */
  timestamp?: number;

  /**
   * Verification error details if verification failed.
   */
  error?: WebhookKitError;
}

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
