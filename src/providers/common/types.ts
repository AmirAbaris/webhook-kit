import type { HeaderRecord, RawBody, WebhookReplayStore } from "../../types.js";

export interface ProviderVerifyOptions {
  /**
   * Raw body input (Request, string, buffer). Must not be pre-parsed.
   */
  body: RawBody;

  /**
   * Webhook signing secret provided by the platform dashboard.
   */
  secret: string | Uint8Array;

  /**
   * Request headers or header value containing the signature.
   */
  headers?: HeaderRecord;

  /**
   * Explicit signature header value if already extracted.
   */
  signature?: string;

  /**
   * Tolerance in seconds for replay-attack prevention (where supported).
   */
  toleranceSeconds?: number;

  /**
   * Optional idempotency / replay store (`has(eventId)` / `set(eventId, ttl)`) to reject duplicate webhooks.
   */
  store?: WebhookReplayStore;

  /**
   * Optional explicit webhook event ID for idempotency / replay store tracking.
   */
  eventId?: string;

  /**
   * Optional TTL in seconds for entries recorded in `store` (defaults to `toleranceSeconds` or `300`).
   */
  storeTtlSeconds?: number;

  /**
   * Whether to automatically parse the verified body as JSON. Defaults to true.
   */
  parseJson?: boolean;
}
