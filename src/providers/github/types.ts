import type { ProviderVerifyOptions } from "../common/types.js";

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
