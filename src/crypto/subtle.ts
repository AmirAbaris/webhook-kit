/**
 * Web Cryptography API helper utilities using globalThis.crypto.subtle.
 * Provides zero-dependency, edge-compatible HMAC computation and constant-time verification.
 */

/**
 * Output encodings supported by `computeSubtleHmac`.
 */
export type SubtleHmacEncoding = "hex" | "base64" | "uint8array" | "binary";

/**
 * Options for configuring HMAC computation output.
 */
export interface SubtleHmacOptions {
  /**
   * Output encoding format. Defaults to `'uint8array'`.
   */
  encoding?: SubtleHmacEncoding;

  /**
   * Whether to bypass the in-memory CryptoKey cache. Defaults to `false`.
   */
  bypassCache?: boolean;
}

/**
 * Sanitizes and bounds the maximum capacity for `CryptoKeyLruCache`.
 *
 * @param size - Candidate capacity option.
 * @returns Positive bounded integer capacity.
 */
function sanitizeCacheCapacity(size: number | undefined): number {
  return typeof size === "number" && Number.isFinite(size) && size > 0
    ? Math.floor(size)
    : 256;
}

/**
 * Lightweight LRU (Least Recently Used) cache backed by a JavaScript `Map`.
 * Reuses compiled WebCrypto keys across concurrent requests and evicts the
 * oldest entries when capacity is reached.
 */
export class CryptoKeyLruCache {
  private readonly maxSize: number;

  private readonly map = new Map<string, Promise<CryptoKey>>();

  constructor(maxSize = 256) {
    this.maxSize = sanitizeCacheCapacity(maxSize);
  }

  get(key: string): Promise<CryptoKey> | undefined {
    const item = this.map.get(key);

    if (!item) {
      return undefined;
    }

    // Refresh LRU order: delete and re-insert to mark as most recently used
    this.map.delete(key);
    this.map.set(key, item);

    return item;
  }

  set(key: string, value: Promise<CryptoKey>): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      const oldestKey = this.map.keys().next().value;

      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }

    this.map.set(key, value);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  delete(key: string): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  get capacity(): number {
    return this.maxSize;
  }
}

/**
 * Global in-memory LRU cache holding compiled WebCrypto HMAC keys.
 */
const defaultCryptoKeyCache = new CryptoKeyLruCache(256);

/**
 * Computes a fast 128-bit composite hash of secret bytes for safe cache key generation
 * without retaining raw secret strings or byte sequences in cache keys.
 *
 * @param bytes Raw secret bytes.
 * @returns Hex-encoded composite hash with length prefix.
 */
function hashSecret(bytes: Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x27d4eb2f;
  let h3 = 0x9e3779b9;
  let h4 = 0x45670123;
  const len = bytes.length;

  for (let i = 0; i < len; i++) {
    const b = bytes[i]!;
    h1 = Math.imul(h1 ^ b, 0x01000193);
    h2 = Math.imul(h2 ^ (b + i), 0x5bd1e995);
    h3 = Math.imul(h3 ^ ((b << 4) | (b >>> 4)), 0x1b873593);
    h4 = Math.imul(h4 ^ (b * 31), 0xcc9e2d51);
  }

  return `${len}_${(h1 >>> 0).toString(16)}_${(h2 >>> 0).toString(16)}_${(h3 >>> 0).toString(16)}_${(h4 >>> 0).toString(16)}`;
}

/**
 * Generates an in-memory cache key composed of the normalized algorithm and secret hash.
 *
 * @param normalizedHash Normalized hash algorithm (e.g. `'SHA-256'`).
 * @param secretBytes Raw secret bytes.
 * @returns Formatted cache key string.
 */
function getSecretCacheKey(
  normalizedHash: string,
  secretBytes: Uint8Array,
): string {
  return `${normalizedHash}:${hashSecret(secretBytes)}`;
}

/**
 * Invokes `crypto.subtle.importKey` for an HMAC signing key.
 */
function importHmacKey(
  subtle: SubtleCrypto,
  normalizedHash: string,
  secretBytes: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  return subtle.importKey(
    "raw",
    secretBytes,
    {
      name: "HMAC",
      hash: { name: normalizedHash },
    },
    false,
    ["sign"],
  );
}

/**
 * Resolves a compiled `CryptoKey` from cache or initiates and caches a new one.
 */
function getOrCreateCryptoKey(
  subtle: SubtleCrypto,
  normalizedHash: string,
  secretBytes: Uint8Array<ArrayBuffer>,
  cache: CryptoKeyLruCache = defaultCryptoKeyCache,
): Promise<CryptoKey> {
  const cacheKey = getSecretCacheKey(normalizedHash, secretBytes);
  const cachedPromise = cache.get(cacheKey);

  if (cachedPromise) {
    return cachedPromise;
  }

  const keyPromise = importHmacKey(subtle, normalizedHash, secretBytes);

  // Evict immediately on error to avoid caching rejected promises
  keyPromise.catch(() => {
    if (cache.get(cacheKey) === keyPromise) {
      cache.delete(cacheKey);
    }
  });

  cache.set(cacheKey, keyPromise);

  return keyPromise;
}

/**
 * Clears all compiled WebCrypto HMAC keys from the global key cache.
 */
export function clearCryptoKeyCache(): void {
  defaultCryptoKeyCache.clear();
}

/**
 * Returns the current number of compiled WebCrypto HMAC keys stored in the global key cache.
 */
export function getCryptoKeyCacheSize(): number {
  return defaultCryptoKeyCache.size;
}

/**
 * Retrieves a cached WebCrypto HMAC key or compiles and caches a new one.
 *
 * @param algorithm HMAC digest algorithm (e.g. `'SHA-256'`).
 * @param secret Raw secret string or byte array.
 * @param cache Optional custom `CryptoKeyLruCache` instance.
 * @returns Compiled `CryptoKey` instance.
 */
export async function getCachedCryptoKey(
  algorithm: string,
  secret: string | Uint8Array,
  cache: CryptoKeyLruCache = defaultCryptoKeyCache,
): Promise<CryptoKey> {
  const subtle = globalThis.crypto?.subtle;

  if (!subtle) {
    throw new Error(
      "Web Cryptography API (crypto.subtle) is not available in the current runtime environment.",
    );
  }

  const normalizedHash = normalizeHashAlgorithm(algorithm);
  const secretBytes = toUint8Array(secret);

  return getOrCreateCryptoKey(subtle, normalizedHash, secretBytes, cache);
}

/**
 * Normalizes hash algorithm names into standard W3C Web Crypto format.
 *
 * @param algorithm Algorithm identifier (e.g. `'sha256'`, `'SHA256'`, `'SHA-256'`).
 * @returns Normalized Web Crypto hash identifier (e.g. `'SHA-256'`).
 */
function normalizeHashAlgorithm(algorithm: string): string {
  const upper = algorithm.toUpperCase().trim();
  // WHY: Web Crypto subtle.importKey strictly requires hyphenated SHA names
  // ('SHA-256', 'SHA-384', 'SHA-512'), whereas Node/OpenSSL callers often pass 'sha256'.
  if (/^SHA-?\d+$/.test(upper)) {
    return upper.startsWith("SHA-") ? upper : upper.replace("SHA", "SHA-");
  }
  return upper;
}

/**
 * Converts a string or buffer into a `Uint8Array` backed by an `ArrayBuffer`.
 *
 * @param input String, `Uint8Array`, or `ArrayBuffer` payload.
 * @returns `Uint8Array<ArrayBuffer>` view suitable for Web Crypto `BufferSource`.
 */
function toUint8Array(
  input: string | Uint8Array | ArrayBuffer,
): Uint8Array<ArrayBuffer> {
  if (typeof input === "string") {
    return new TextEncoder().encode(input);
  }
  if (input instanceof Uint8Array) {
    // WHY: TypeScript 5.7+/7.0 DOM typings parameterize Uint8Array<ArrayBufferLike>
    // which fails BufferSource assignment due to SharedArrayBuffer. Re-wrapping
    // over ArrayBuffer satisfies strict DOM BufferSource without copying bytes.
    return new Uint8Array(
      input.buffer as ArrayBuffer,
      input.byteOffset,
      input.byteLength,
    );
  }
  return new Uint8Array(input);
}

/**
 * Constant-time comparison between two buffers or strings to prevent timing side-channel attacks.
 *
 * @param a First byte array or string.
 * @param b Second byte array or string.
 * @returns `true` if byte sequences are identical, `false` otherwise.
 */
export function timingSafeEqual(
  a: Uint8Array | string,
  b: Uint8Array | string,
): boolean {
  const bufA = typeof a === "string" ? new TextEncoder().encode(a) : a;
  const bufB = typeof b === "string" ? new TextEncoder().encode(b) : b;

  const lenA = bufA.length;
  const lenB = bufB.length;
  // WHY: Seed `mismatch` with length inequality and still iterate across `maxLen`
  // so mismatched-length inputs do not short-circuit and leak length via timing.
  let mismatch = lenA === lenB ? 0 : 1;
  const maxLen = Math.max(lenA, lenB);

  for (let i = 0; i < maxLen; i++) {
    const byteA = i < lenA ? bufA[i]! : 0;
    const byteB = i < lenB ? bufB[i]! : 0;
    mismatch |= byteA ^ byteB;
  }

  return mismatch === 0;
}

/**
 * Formats a raw HMAC digest according to the requested encoding.
 */
function formatHmacDigest(
  bytes: Uint8Array,
  encoding?: SubtleHmacEncoding,
): Uint8Array | string {
  if (encoding === "hex") {
    return bytesToHex(bytes);
  }

  if (encoding === "base64") {
    return bytesToBase64(bytes);
  }

  return bytes;
}

/**
 * Normalizes options and extract encoding and cache preferences.
 */
function extractHmacOptions(
  encodingOrOptions?: SubtleHmacEncoding | SubtleHmacOptions,
): { encoding?: SubtleHmacEncoding; bypassCache: boolean } {
  if (typeof encodingOrOptions === "string") {
    return { encoding: encodingOrOptions, bypassCache: false };
  }

  return {
    encoding: encodingOrOptions?.encoding,
    bypassCache: Boolean(encodingOrOptions?.bypassCache),
  };
}

/**
 * Obtains a `CryptoKey` either by bypassing or utilizing the LRU cache.
 */
function resolveSubtleHmacKey(
  subtle: SubtleCrypto,
  normalizedHash: string,
  secretBytes: Uint8Array<ArrayBuffer>,
  bypassCache: boolean,
): Promise<CryptoKey> {
  if (bypassCache) {
    return importHmacKey(subtle, normalizedHash, secretBytes);
  }

  return getOrCreateCryptoKey(subtle, normalizedHash, secretBytes);
}

/**
 * Computes an HMAC digest using `crypto.subtle` across modern JavaScript runtimes.
 *
 * @param algorithm HMAC digest algorithm (`'SHA-256'`, `'SHA-384'`, `'SHA-512'`, `'SHA-1'`).
 * @param secret Shared secret key as UTF-8 string or raw bytes.
 * @param data Raw payload string or bytes.
 * @param encodingOrOptions Output encoding (`'uint8array'`, `'hex'`, `'base64'`) or options object.
 * @returns Raw HMAC digest bytes (`Uint8Array`) or encoded digest string.
 */
export async function computeSubtleHmac(
  algorithm: string,
  secret: string | Uint8Array,
  data: string | Uint8Array,
  encodingOrOptions?:
    | "uint8array"
    | "binary"
    | { encoding?: "uint8array" | "binary"; bypassCache?: boolean },
): Promise<Uint8Array>;

export async function computeSubtleHmac(
  algorithm: string,
  secret: string | Uint8Array,
  data: string | Uint8Array,
  encodingOrOptions:
    "hex" | "base64" | { encoding: "hex" | "base64"; bypassCache?: boolean },
): Promise<string>;

export async function computeSubtleHmac(
  algorithm: string,
  secret: string | Uint8Array,
  data: string | Uint8Array,
  encodingOrOptions?: SubtleHmacEncoding | SubtleHmacOptions,
): Promise<Uint8Array | string> {
  const subtle = globalThis.crypto?.subtle;

  if (!subtle) {
    throw new Error(
      "Web Cryptography API (crypto.subtle) is not available in the current runtime environment.",
    );
  }

  const normalizedHash = normalizeHashAlgorithm(algorithm);
  const secretBytes = toUint8Array(secret);
  const dataBytes = toUint8Array(data);
  const { encoding, bypassCache } = extractHmacOptions(encodingOrOptions);

  const key = await resolveSubtleHmacKey(
    subtle,
    normalizedHash,
    secretBytes,
    bypassCache,
  );

  const signatureBuffer = await subtle.sign("HMAC", key, dataBytes);

  return formatHmacDigest(new Uint8Array(signatureBuffer), encoding);
}

/**
 * Converts a `Uint8Array` into a lowercase hexadecimal string.
 *
 * @param bytes Input byte array.
 * @returns Lowercase hexadecimal string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Converts a hexadecimal string into a `Uint8Array`.
 *
 * @param hex Hexadecimal string (with optional `0x` prefix).
 * @returns Decoded byte array.
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;

  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new TypeError(
      "Invalid hexadecimal string: contains non-hexadecimal characters",
    );
  }

  // WHY: Pad odd-length hex strings with a leading zero so byte slicing remains aligned.
  const normalizedHex = cleanHex.length % 2 === 1 ? `0${cleanHex}` : cleanHex;
  const bytes = new Uint8Array(normalizedHex.length / 2);

  for (let i = 0; i < normalizedHex.length; i += 2) {
    bytes[i / 2] = parseInt(normalizedHex.slice(i, i + 2), 16);
  }

  return bytes;
}

/**
 * Converts a `Uint8Array` into a Base64-encoded string using standard Web APIs.
 *
 * @param bytes Input byte array.
 * @returns Base64-encoded string.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  // WHY: Chunk String.fromCharCode calls at 32 KiB to avoid V8/JSC call-stack
  // argument limits on large buffers while staying 100% Buffer-free on edge runtimes.
  const chunkSize = 0x8000;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode(...chunk);
  }
  return globalThis.btoa(binary);
}

/**
 * Converts a Base64-encoded string into a `Uint8Array` using standard Web APIs.
 *
 * @param base64 Base64-encoded string.
 * @returns Decoded byte array.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
