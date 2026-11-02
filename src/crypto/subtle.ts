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
    "uint8array" | "binary" | { encoding?: "uint8array" | "binary" },
): Promise<Uint8Array>;

export async function computeSubtleHmac(
  algorithm: string,
  secret: string | Uint8Array,
  data: string | Uint8Array,
  encodingOrOptions: "hex" | "base64" | { encoding: "hex" | "base64" },
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

  const key = await subtle.importKey(
    "raw",
    secretBytes,
    {
      name: "HMAC",
      hash: { name: normalizedHash },
    },
    false,
    ["sign"],
  );

  const signatureBuffer = await subtle.sign("HMAC", key, dataBytes);
  const signatureBytes = new Uint8Array(signatureBuffer);

  const encoding =
    typeof encodingOrOptions === "string"
      ? encodingOrOptions
      : encodingOrOptions?.encoding;

  if (encoding === "hex") {
    return bytesToHex(signatureBytes);
  }
  if (encoding === "base64") {
    return bytesToBase64(signatureBytes);
  }
  return signatureBytes;
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
