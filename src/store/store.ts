import { ReplayAttackError } from "../errors.js";
import type { HeaderRecord, RawBody, WebhookReplayStore } from "../types.js";
import { extractHeaderValue } from "../utils/headers.js";
import type {
  InMemoryReplayStoreOptions,
  VerifyReplayStoreOptions,
} from "./types.js";

export const DEFAULT_REPLAY_STORE_MAX_SIZE = 10_000;

export const DEFAULT_REPLAY_STORE_TTL_SECONDS = 300;

export const GENERIC_EVENT_ID_HEADERS = [
  "x-webhook-id",
  "webhook-id",
  "x-github-delivery",
  "x-shopify-webhook-id",
  "x-event-id",
  "x-idempotency-key",
] as const;

/**
 * Default in-memory TTL replay store backed by a JavaScript `Map`.
 * Automatically evicts expired entries on lookup and enforces an upper capacity bound
 * with LRU (Least Recently Used) eviction.
 */
export class InMemoryReplayStore implements WebhookReplayStore {
  private readonly maxSize: number;

  private readonly defaultTtlSeconds: number;

  private readonly now: () => number;

  private readonly entries = new Map<string, number>();

  constructor(options: InMemoryReplayStoreOptions = {}) {
    this.maxSize = options.maxSize ?? DEFAULT_REPLAY_STORE_MAX_SIZE;
    this.defaultTtlSeconds =
      options.defaultTtlSeconds ?? DEFAULT_REPLAY_STORE_TTL_SECONDS;
    this.now = options.now ?? Date.now;
  }

  /**
   * Checks whether `eventId` is currently tracked and unexpired in the store.
   *
   * @param eventId - Unique webhook event or delivery identifier.
   * @returns `true` if `eventId` is present and unexpired, `false` otherwise.
   */
  has(eventId: string): boolean {
    const expiresAt = this.entries.get(eventId);

    if (expiresAt === undefined) {
      return false;
    }

    if (this.now() >= expiresAt) {
      // WHY: Lazily delete expired entries on read so stale event IDs do not accumulate
      // without requiring background setInterval timers that prevent clean process exit.
      this.entries.delete(eventId);

      return false;
    }

    return true;
  }

  /**
   * Records `eventId` in the store with the specified TTL in seconds.
   *
   * @param eventId - Unique webhook event or delivery identifier.
   * @param ttlSeconds - Time-to-live in seconds before expiration.
   */
  set(eventId: string, ttlSeconds: number = this.defaultTtlSeconds): void {
    const effectiveTtl = Number.isFinite(ttlSeconds)
      ? ttlSeconds
      : this.defaultTtlSeconds;

    if (effectiveTtl <= 0) {
      this.entries.delete(eventId);

      return;
    }

    if (this.entries.has(eventId)) {
      this.entries.delete(eventId);
    } else if (this.entries.size >= this.maxSize) {
      this.evictExpiredOrOldest();
    }

    this.entries.set(eventId, this.now() + effectiveTtl * 1000);
  }

  /**
   * Removes a specific `eventId` from the store.
   *
   * @param eventId - Unique webhook event or delivery identifier.
   * @returns `true` if the entry existed and was removed.
   */
  delete(eventId: string): boolean {
    return this.entries.delete(eventId);
  }

  /**
   * Clears all tracked event IDs from the store.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Removes all expired entries from the store and returns the number of purged entries.
   *
   * @returns Count of expired entries removed.
   */
  prune(): number {
    const currentMs = this.now();
    let removed = 0;

    for (const [key, expiresAt] of this.entries.entries()) {
      if (currentMs >= expiresAt) {
        this.entries.delete(key);
        removed += 1;
      }
    }

    return removed;
  }

  /**
   * Returns the current number of entries stored in the underlying map.
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Returns the maximum capacity of the store.
   */
  get capacity(): number {
    return this.maxSize;
  }

  private evictExpiredOrOldest(): void {
    this.prune();

    if (this.entries.size < this.maxSize) {
      return;
    }

    const oldestKey = this.entries.keys().next().value;

    if (oldestKey !== undefined) {
      this.entries.delete(oldestKey);
    }
  }
}

/**
 * Creates a new `InMemoryReplayStore` instance with optional capacity and TTL settings.
 *
 * @param options - Optional capacity, default TTL, and clock configuration.
 * @returns Configured `InMemoryReplayStore` instance.
 */
export function createInMemoryReplayStore(
  options?: InMemoryReplayStoreOptions,
): InMemoryReplayStore {
  return new InMemoryReplayStore(options);
}

/**
 * Searches candidate header names in a `Headers` or record object for a non-empty value.
 *
 * @param headers - Headers source.
 * @param candidateNames - Ordered list of lowercase header names.
 * @returns Trimmed non-empty header value or undefined.
 */
function findHeaderValue(
  headers: HeaderRecord | undefined,
  candidateNames: readonly string[],
): string | undefined {
  if (!headers) {
    return undefined;
  }

  for (const name of candidateNames) {
    const raw = extractHeaderValue(headers, name);
    const trimmed = raw?.trim();

    if (trimmed) {
      return trimmed;
    }
  }

  return undefined;
}

/**
 * Resolves a record object from either an already-parsed payload or a raw JSON string.
 *
 * @param payload - Parsed payload value.
 * @param rawBody - Raw body string.
 * @returns Object record or null.
 */
function resolvePayloadObject(
  payload: unknown,
  rawBody?: string,
): Record<string, unknown> | null {
  if (typeof payload === "object" && payload !== null) {
    return payload as Record<string, unknown>;
  }

  if (!rawBody) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(rawBody);

    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Extracts a string or finite number `id` property from a parsed payload or raw JSON body.
 *
 * @param payload - Already parsed payload object if available.
 * @param rawBody - Raw JSON string fallback when `parseJson` was disabled.
 * @returns Extracted string event ID or undefined.
 */
function extractIdFromPayload(
  payload: unknown,
  rawBody?: string,
): string | undefined {
  const candidate = resolvePayloadObject(payload, rawBody);

  if (!candidate) {
    return undefined;
  }

  const idValue = candidate.id;

  if (typeof idValue === "string" && idValue.trim()) {
    return idValue.trim();
  }

  if (typeof idValue === "number" && Number.isFinite(idValue)) {
    return String(idValue);
  }

  return undefined;
}

/**
 * Extracts a matching header value from a Web Standard `Request` body if provided.
 *
 * @param body - Candidate raw body input.
 * @param headerCandidates - Ordered delivery ID header names.
 * @returns Matching header value or undefined.
 */
function findHeaderInRequest(
  body: RawBody | undefined,
  headerCandidates: readonly string[],
): string | undefined {
  if (typeof Request !== "undefined" && body instanceof Request) {
    return findHeaderValue(body.headers, headerCandidates);
  }

  return undefined;
}

/**
 * Resolves the unique webhook event ID from explicit options, delivery headers, or payload `id`.
 *
 * @param options - Source options containing explicit `eventId`, `headers`, `body`, `payload`, and `rawBody`.
 * @param headerCandidates - Ordered delivery ID header names to inspect prior to payload fallback.
 * @returns Resolved non-empty event ID string or `undefined`.
 */
export function resolveWebhookEventId(
  options: {
    eventId?: string;
    headers?: HeaderRecord;
    body?: RawBody;
    payload?: unknown;
    rawBody?: string;
  },
  headerCandidates: readonly string[] = GENERIC_EVENT_ID_HEADERS,
): string | undefined {
  const explicitId = options.eventId?.trim();

  if (explicitId) {
    return explicitId;
  }

  const fromHeaders =
    findHeaderValue(options.headers, headerCandidates) ??
    findHeaderInRequest(options.body, headerCandidates);

  if (fromHeaders) {
    return fromHeaders;
  }

  return extractIdFromPayload(options.payload, options.rawBody);
}

/**
 * Computes the effective replay store TTL in seconds from explicit `storeTtlSeconds` or `toleranceSeconds`.
 *
 * @param storeTtlSeconds - Explicit TTL in seconds.
 * @param toleranceSeconds - Timestamp tolerance in seconds.
 * @returns Positive TTL in seconds (defaults to 300s).
 */
function resolveEffectiveTtl(
  storeTtlSeconds?: number,
  toleranceSeconds?: number,
): number {
  if (storeTtlSeconds !== undefined && storeTtlSeconds > 0) {
    return storeTtlSeconds;
  }

  if (toleranceSeconds !== undefined && toleranceSeconds > 0) {
    return toleranceSeconds;
  }

  return DEFAULT_REPLAY_STORE_TTL_SECONDS;
}

/**
 * Verifies that `eventId` has not already been seen in `store`, and records it with a TTL if unseen.
 *
 * @param options - Store instance, resolved `eventId`, and TTL configuration.
 * @returns `ReplayAttackError` if `eventId` is already present in `store`, or `null` if unseen / no store.
 */
export async function checkAndRecordReplay(
  options: VerifyReplayStoreOptions,
): Promise<ReplayAttackError | null> {
  const { store, eventId } = options;

  if (!store || !eventId) {
    return null;
  }

  const alreadySeen = await store.has(eventId);

  if (alreadySeen) {
    return new ReplayAttackError(eventId);
  }

  const ttlSeconds = resolveEffectiveTtl(
    options.storeTtlSeconds,
    options.toleranceSeconds,
  );

  await store.set(eventId, ttlSeconds);

  return null;
}
