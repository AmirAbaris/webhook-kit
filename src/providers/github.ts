import type { WebhookVerificationResult } from "../types.js";
import type { ProviderVerifyOptions } from "./types.js";

export interface GithubVerifyOptions extends ProviderVerifyOptions {
  /**
   * X-Hub-Signature-256 header format: `sha256=d57c68d10b284e3d...`
   */
  signature?: string;
}

/**
 * Verifies a GitHub webhook payload signature against `X-Hub-Signature-256`.
 *
 * GitHub signs the raw request payload using HMAC-SHA256 with the webhook secret.
 *
 * @param options - GitHub verification options
 * @returns Verification result with typed payload
 */
export async function verifyGithubWebhook<T = unknown>(
  _options: GithubVerifyOptions,
): Promise<WebhookVerificationResult<T>> {
  // TODO: Implement GitHub X-Hub-Signature-256 prefix stripping and constant-time HMAC verification
  throw new Error(
    "verifyGithubWebhook: stub implementation pending full cryptographic logic",
  );
}
