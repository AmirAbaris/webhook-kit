import {
  InvalidSignatureHeaderError,
  SignatureVerificationError,
  WebhookKitError,
} from "../../errors.js";
import { extractHeaderValue } from "../../utils/headers.js";
import { assertNonEmptyHeader } from "../common/assertions.js";
import type { GithubVerifyOptions } from "./types.js";

export const GITHUB_SIGNATURE_PREFIX = "sha256=";

export const GITHUB_EVENT_ID_HEADERS = [
  "x-github-delivery",
  "x-webhook-id",
  "webhook-id",
] as const;

/**
 * Parses an `X-Hub-Signature-256` header, validating and extracting the hex signature.
 *
 * @param header - Raw `X-Hub-Signature-256` header string (e.g. `sha256=d57c68d1...`).
 * @returns Hexadecimal signature string after the `sha256=` prefix.
 * @throws {InvalidSignatureHeaderError} If header is missing, empty, or lacks a valid sha256= prefix.
 */
export function parseGithubSignature(header: string): string {
  assertNonEmptyHeader(header, "Missing or empty X-Hub-Signature-256 header");

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
 * Resolves the raw signature header string from options, headers record, or request.
 *
 * @param options - GitHub verification options.
 * @returns GitHub signature header string or undefined if not found.
 */
export function resolveGithubSignatureHeader(
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
export function validateGithubPreconditions(
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
export function safeParseGithubHeader(
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
