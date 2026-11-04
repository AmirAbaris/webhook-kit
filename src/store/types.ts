import type { WebhookReplayStore } from "../types.js";

/**
 * Configuration options for `InMemoryReplayStore` / `createInMemoryReplayStore`.
 */
export interface InMemoryReplayStoreOptions {
  /**
   * Maximum number of entries retained in memory before evicting expired or oldest entries.
   * Defaults to `10_000`.
   */
  maxSize?: number;

  /**
   * Default time-to-live in seconds when `ttlSeconds` is omitted or invalid.
   * Defaults to `300` (5 minutes).
   */
  defaultTtlSeconds?: number;

  /**
   * Optional clock function returning current time in milliseconds (defaults to `Date.now`).
   * Useful for deterministic unit testing.
   */
  now?: () => number;
}

/**
 * Options for checking and recording an event ID in a `WebhookReplayStore`.
 */
export interface VerifyReplayStoreOptions {
  /**
   * Optional replay store instance.
   */
  store?: WebhookReplayStore;

  /**
   * Resolved event ID to check and record.
   */
  eventId?: string;

  /**
   * Explicit TTL in seconds for `store.set(eventId, ttl)`.
   */
  storeTtlSeconds?: number;

  /**
   * Fallback tolerance window in seconds used when `storeTtlSeconds` is not provided.
   */
  toleranceSeconds?: number;
}
