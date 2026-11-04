import { computeSubtleHmac, timingSafeEqual } from "../../crypto/subtle.js";
import { SignatureVerificationError } from "../../errors.js";
import { checkAndRecordReplay, resolveWebhookEventId } from "../../store.js";
import type {
  WebhookProviderPlugin,
  WebhookVerificationResult,
} from "../../types.js";
import { extractRawBody } from "../../utils/extract-body.js";
import { failVerification, tryParseJson } from "../common/helpers.js";
import {
  GITHUB_EVENT_ID_HEADERS,
  resolveGithubSignatureHeader,
  safeParseGithubHeader,
  validateGithubPreconditions,
} from "./signature.js";
import type { GithubVerifyOptions, GithubWebhookEvent } from "./types.js";

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
  const rawHeader = resolveGithubSignatureHeader(options);

  const preconditionError = validateGithubPreconditions(options, rawHeader);

  if (preconditionError) {
    return failVerification(rawBody, preconditionError, options.throwOnError);
  }

  const parsed = safeParseGithubHeader(rawHeader!);

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
      undefined,
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
