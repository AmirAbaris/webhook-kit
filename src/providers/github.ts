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
import { checkAndRecordReplay, resolveWebhookEventId } from "../store.js";
import { extractRawBody } from "../utils/extract-body.js";
import type { ProviderVerifyOptions } from "./types.js";

const GITHUB_SIGNATURE_PREFIX = "sha256=";

const GITHUB_EVENT_ID_HEADERS = [
  "x-github-delivery",
  "x-webhook-id",
  "webhook-id",
] as const;

/**
 * Standard shape of a GitHub Webhook Event payload.
 */
export interface GithubWebhookEvent {
  action?: string;
  sender?: Record<string, unknown>;
  repository?: Record<string, unknown>;
  organization?: Record<string, unknown>;
  installation?: Record<string, unknown>;
  zen?: string;
  hook_id?: number;
  hook?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Options for GitHub webhook verification.
 */
export interface GithubVerifyOptions extends ProviderVerifyOptions {
  /**
   * X-Hub-Signature-256 header format: `sha256=d57c68d10b284e3d...`
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
      "Missing or empty X-Hub-Signature-256 header",
    );
  }
}

/**
 * Parses an `X-Hub-Signature-256` header, validating and extracting the hex signature.
 *
 * @param header - Raw `X-Hub-Signature-256` header string (e.g. `sha256=d57c68d1...`).
 * @returns Hexadecimal signature string after the `sha256=` prefix.
 * @throws {InvalidSignatureHeaderError} If header is missing, empty, or lacks a valid sha256= prefix.
 */
export function parseGithubSignature(header: string): string {
  assertNonEmptyHeader(header);

  const trimmed = header.trim();
  const lower = trimmed.toLowerCase();

  if (!lower.startsWith(GITHUB_SIGNATURE_PREFIX)) {
    throw new InvalidSignatureHeaderError(
      "Invalid X-Hub-Signature-256 header format: expected 'sha256=' prefix",
    );
  }

  const signature = trimmed.slice(GITHUB_SIGNATURE_PREFIX.length).trim();

  // WHY: GitHub HMAC-SHA256 digests require a non-empty hex hash following sha256=
  if (!signature) {
    throw new InvalidSignatureHeaderError(
      "Invalid X-Hub-Signature-256 header: missing signature hash after prefix",
    );
  }

  return signature;
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
 * @param options - GitHub verification options.
 * @returns GitHub signature header string or undefined if not found.
 */
function resolveSignatureHeader(
  options: GithubVerifyOptions,
): string | undefined {
  if (options.signature) {
    return options.signature;
  }

  if (options.headers) {
    return extractHeaderValue(options.headers, "x-hub-signature-256");
  }

  if (typeof Request !== "undefined" && options.body instanceof Request) {
    return options.body.headers.get("x-hub-signature-256") ?? undefined;
  }

  return undefined;
}

/**
 * Validates preconditions for GitHub webhook verification.
 *
 * @param options - GitHub verification options.
 * @param rawHeader - Resolved header string.
 * @returns Error if preconditions fail, null otherwise.
 */
function validatePreconditions(
  options: GithubVerifyOptions,
  rawHeader: string | undefined,
): WebhookKitError | null {
  if (!options.secret) {
    return new SignatureVerificationError(
      "Missing GitHub webhook signing secret",
    );
  }

  if (!rawHeader) {
    return new InvalidSignatureHeaderError(
      "Missing X-Hub-Signature-256 header",
    );
  }

  return null;
}

/**
 * Safely parses the raw signature header without uncaught exceptions.
 *
 * @param rawHeader - Raw header string.
 * @returns Extracted signature string or error object.
 */
function safeParseHeader(
  rawHeader: string,
): { signature: string } | { error: WebhookKitError } {
  try {
    const signature = parseGithubSignature(rawHeader);

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
  eventId?: string,
): WebhookVerificationResult<never> {
  if (throwOnError) {
    throw error;
  }

  return {
    valid: false,
    rawBody,
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
 * Verifies a GitHub webhook payload signature against `X-Hub-Signature-256`.
 *
 * GitHub signs the raw request payload using HMAC-SHA256 with the webhook secret.
 *
 * @param options - GitHub verification options.
 * @returns Verification result with typed payload.
 */
export async function verifyGithubWebhook<T = GithubWebhookEvent>(
  options: GithubVerifyOptions,
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

  // WHY: GitHub computes HMAC-SHA256 over raw body payload using shared webhook secret
  const expectedSig = await computeSubtleHmac(
    "SHA-256",
    options.secret,
    rawBody,
    "hex",
  );

  // WHY: Lowercase both signatures before constant-time comparison to ensure
  // hex casing variations do not produce false rejections while preventing side-channel timing leaks.
  const isValid = timingSafeEqual(
    expectedSig.toLowerCase(),
    parsed.signature.toLowerCase(),
  );

  if (!isValid) {
    const error = new SignatureVerificationError(
      "GitHub signature verification failed: signature does not match expected HMAC",
    );

    return failVerification(rawBody, error, options.throwOnError);
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
    GITHUB_EVENT_ID_HEADERS,
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
      eventId,
    );
  }

  return {
    valid: true,
    rawBody,
    eventId,
    payload: payload as T,
  };
}

/**
 * Asserts that a GitHub webhook payload signature is valid, throwing on verification failure.
 *
 * @param options - GitHub verification options.
 * @returns Parsed and typed event payload.
 * @throws {SignatureVerificationError} If signature verification fails.
 * @throws {InvalidSignatureHeaderError} If header format is invalid or missing.
 */
export async function assertGithubWebhook<T = GithubWebhookEvent>(
  options: GithubVerifyOptions,
): Promise<T> {
  const result = await verifyGithubWebhook<T>({
    ...options,
    throwOnError: true,
  });

  return result.payload as T;
}

/**
 * Webhook provider plugin for GitHub.
 */
export const githubPlugin: WebhookProviderPlugin<
  GithubWebhookEvent,
  GithubVerifyOptions
> = {
  name: "github",
  verify: verifyGithubWebhook,
};
