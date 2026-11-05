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
  "svix-id",
  "x-github-delivery",
  "x-shopify-webhook-id",
  "x-event-id",
  "x-idempotency-key",
] as const;

/**
 * Tracks in-flight replay check promises per store instance to prevent TOCTOU race conditions
 * during concurrent duplicate deliveries across stores that only implement `has` and `set`.
 */
const inFlightPerStore = new WeakMap<
  WebhookReplayStore,
  Map<string, Promise<ReplayAttackError | null>>
>();

/**
 * Sanitizes and bounds the maximum capacity for `InMemoryReplayStore`.
 *
 * @param size - Candidate capacity option.
 * @returns Positive bounded integer capacity.
 */
function sanitizeCapacity(size: number | undefined): number {
  return typeof size === "number" && Number.isFinite(size) && size > 0
    ? Math.floor(size)
    : DEFAULT_REPLAY_STORE_MAX_SIZE;
}

/**
 * Sanitizes and bounds the default TTL for `InMemoryReplayStore`.
 *
 * @param ttl - Candidate default TTL option.
 * @returns Positive finite TTL in seconds.
 */
function sanitizeTtl(ttl: number | undefined): number {
  return typeof ttl === "number" && Number.isFinite(ttl) && ttl > 0
    ? ttl
    : DEFAULT_REPLAY_STORE_TTL_SECONDS;
}

/**
 * Resolves the effective TTL for a store insert from explicit TTL or default fallback.
 *
 * @param ttl - Explicit TTL in seconds.
 * @param defaultTtl - Default TTL fallback.
 * @returns Resolved finite TTL in seconds.
 */
function resolveInsertTtl(ttl: number | undefined, defaultTtl: number): number {
  return typeof ttl === "number" && Number.isFinite(ttl) ? ttl : defaultTtl;
}

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

  private lastPruneMs = 0;

  constructor(options: InMemoryReplayStoreOptions = {}) {
    this.maxSize = sanitizeCapacity(options.maxSize);
    this.defaultTtlSeconds = sanitizeTtl(options.defaultTtlSeconds);
    this.now = options.now ?? Date.now;
  }

  /**
   * Checks whether `eventId` is currently tracked and unexpired in the store.
   *
   * @param eventId - Unique webhook event or delivery identifier.
   * @returns `true` if `eventId` is present and unexpired, `false` otherwise.
   */
  has(eventId: string): boolean {
    if (typeof eventId !== "string" || eventId.length === 0) {
      return false;
    }

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
    if (typeof eventId !== "string" || eventId.length === 0) {
      return;
    }

    const effectiveTtl = resolveInsertTtl(ttlSeconds, this.defaultTtlSeconds);

    if (effectiveTtl <= 0) {
      this.entries.delete(eventId);

      return;
    }

    this.prepareInsertSlot(eventId);
    this.entries.set(eventId, this.now() + effectiveTtl * 1000);
  }

  /**
   * Atomically records `eventId` with TTL if it does not already exist in the store (set-if-not-exists).
   *
   * @param eventId - Unique webhook event or delivery identifier.
   * @param ttlSeconds - Time-to-live in seconds before expiration.
   * @returns `true` if newly recorded, `false` if already present in the store.
   */
  setNx(eventId: string, ttlSeconds: number = this.defaultTtlSeconds): boolean {
    if (this.has(eventId)) {
      return false;
    }

    this.set(eventId, ttlSeconds);

    return true;
  }

  /**
   * Removes a specific `eventId` from the store.
   *
   * @param eventId - Unique webhook event or delivery identifier.
   * @returns `true` if the entry existed and was removed.
   */
  delete(eventId: string): boolean {
    if (typeof eventId !== "string" || eventId.length === 0) {
      return false;
    }

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

  /**
   * Prepares a map slot for insertion by evicting an existing key or pruning capacity.
   *
   * @param eventId - Candidate event ID key.
   */
  private prepareInsertSlot(eventId: string): void {
    if (this.entries.has(eventId)) {
      this.entries.delete(eventId);

      return;
    }

    if (this.entries.size >= this.maxSize) {
      this.evictExpiredOrOldest();
    }
  }

  /**
   * Fast-path check from the head of the insertion-ordered Map to purge expired entries.
   *
   * @param currentMs - Current time in milliseconds.
   */
  private evictHeadExpired(currentMs: number): void {
    for (const [key, expiresAt] of this.entries) {
      if (currentMs >= expiresAt) {
        this.entries.delete(key);

        if (this.entries.size < this.maxSize) {
          return;
        }
      } else {
        // WHY: Map entries are insertion-ordered. If the head entry is not expired,
        // entries with identical or later expiration dates will not be expired either.
        break;
      }
    }
  }

  private evictExpiredOrOldest(): void {
    const currentMs = this.now();

    this.evictHeadExpired(currentMs);

    // WHY: Throttle full O(N) map scans to at most once per second under sustained load
    // so bursts of new events at maximum capacity do not stall the JavaScript event loop.
    const shouldPrune =
      this.entries.size >= this.maxSize &&
      (currentMs - this.lastPruneMs >= 1000 || currentMs < this.lastPruneMs);

    if (shouldPrune) {
      this.lastPruneMs = currentMs;
      this.prune();
    }

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
 * Determines whether a candidate value is a non-null, non-array object record.
 *
 * @param value - Candidate value.
 * @returns `true` if value is a plain object record.
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses a raw JSON string into a record object, ignoring non-object outputs.
 *
 * @param rawBody - Raw body text.
 * @returns Parsed object record or null.
 */
function parseJsonRecord(rawBody?: string): Record<string, unknown> | null {
  if (typeof rawBody !== "string" || rawBody.length === 0) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(rawBody);

    return isPlainRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
  if (isPlainRecord(payload)) {
    return payload;
  }

  return parseJsonRecord(rawBody);
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
 * Sanitizes an explicitly provided `eventId` option into a non-empty string.
 *
 * @param eventId - Candidate event ID.
 * @returns Trimmed event ID or undefined.
 */
function resolveExplicitEventId(eventId?: unknown): string | undefined {
  if (typeof eventId === "string") {
    const trimmed = eventId.trim();

    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof eventId === "number" && Number.isFinite(eventId)) {
    return String(eventId);
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
  const explicitId = resolveExplicitEventId(options.eventId);

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
  if (
    typeof storeTtlSeconds === "number" &&
    Number.isFinite(storeTtlSeconds) &&
    storeTtlSeconds > 0
  ) {
    return storeTtlSeconds;
  }

  if (
    typeof toleranceSeconds === "number" &&
    Number.isFinite(toleranceSeconds) &&
    toleranceSeconds > 0
  ) {
    return toleranceSeconds;
  }

  return DEFAULT_REPLAY_STORE_TTL_SECONDS;
}

/**
 * Checks and records an event ID using a store's basic `has` and `set` primitives.
 *
 * @param store - Webhook replay store.
 * @param eventId - Resolved event identifier.
 * @param ttlSeconds - Time-to-live in seconds.
 * @returns `ReplayAttackError` if already seen, or `null` on success.
 */
async function executeStoreCheckAndRecord(
  store: WebhookReplayStore,
  eventId: string,
  ttlSeconds: number,
): Promise<ReplayAttackError | null> {
  const alreadySeen = await store.has(eventId);

  if (alreadySeen) {
    return new ReplayAttackError(eventId);
  }

  await store.set(eventId, ttlSeconds);

  return null;
}

/**
 * Synchronizes concurrent in-flight checks for the same `eventId` across stores lacking atomic operations.
 *
 * @param store - Webhook replay store.
 * @param eventId - Resolved event identifier.
 * @param ttlSeconds - Time-to-live in seconds.
 * @returns `ReplayAttackError` if duplicate or already tracked, or `null` on success.
 */
async function handleInFlightReplayCheck(
  store: WebhookReplayStore,
  eventId: string,
  ttlSeconds: number,
): Promise<ReplayAttackError | null> {
  let storeInFlight = inFlightPerStore.get(store);

  if (!storeInFlight) {
    storeInFlight = new Map();
    inFlightPerStore.set(store, storeInFlight);
  }

  const existing = storeInFlight.get(eventId);

  if (existing) {
    // WHY: A concurrent verification is already in flight for this exact event ID.
    // If that prior check succeeds, this concurrent invocation is a duplicate replay.
    const result = await existing;

    return result === null ? new ReplayAttackError(eventId) : result;
  }

  const checkPromise = executeStoreCheckAndRecord(store, eventId, ttlSeconds);

  storeInFlight.set(eventId, checkPromise);

  try {
    return await checkPromise;
  } finally {
    storeInFlight.delete(eventId);
  }
}

/**
 * Verifies that `eventId` has not already been seen in `store`, and records it with a TTL if unseen.
 * Automatically leverages atomic `setNx` when supported, or serializes in-flight checks to prevent
 * TOCTOU race conditions under high concurrency.
 *
 * @param options - Store instance, resolved `eventId`, and TTL configuration.
 * @returns `ReplayAttackError` if `eventId` is already present in `store`, or `null` if unseen / no store.
 */
export async function checkAndRecordReplay(
  options: VerifyReplayStoreOptions,
): Promise<ReplayAttackError | null> {
  const { store } = options;

  if (!store) {
    return null;
  }

  const resolvedId = resolveExplicitEventId(options.eventId);

  if (!resolvedId) {
    return null;
  }

  const ttlSeconds = resolveEffectiveTtl(
    options.storeTtlSeconds,
    options.toleranceSeconds,
  );

  // WHY: Prefer atomic set-if-not-exists when provided by the store (e.g. InMemoryReplayStore or Redis SET NX)
  // to eliminate race conditions between checking existence and recording the key.
  if (typeof store.setNx === "function") {
    const recorded = await store.setNx(resolvedId, ttlSeconds);

    return recorded ? null : new ReplayAttackError(resolvedId);
  }

  return handleInFlightReplayCheck(store, resolvedId, ttlSeconds);
}
