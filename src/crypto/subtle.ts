/**
 * Web Cryptography API helper utilities using globalThis.crypto.subtle.
 * Provides zero-dependency, edge-compatible HMAC computation and constant-time verification.
 */

/**
 * Constant-time comparison between two Uint8Array buffers to prevent timing side-channel attacks.
 *
 * @param a - First byte array
 * @param b - Second byte array
 * @returns true if byte sequences are identical, false otherwise
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  // TODO: Add full edge/browser timing-safe comparison logic.
  // Note: Length mismatch should still execute in constant time where possible.
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return mismatch === 0;
}

/**
 * Computes an HMAC digest using crypto.subtle across modern JavaScript runtimes.
 *
 * @param algorithm - HMAC digest algorithm ('SHA-256', 'SHA-384', 'SHA-512', etc.)
 * @param secret - Shared secret key
 * @param data - Raw payload string or bytes
 * @returns Raw HMAC digest bytes
 */
export async function computeSubtleHmac(
  _algorithm: string,
  _secret: string | Uint8Array,
  _data: string | Uint8Array,
): Promise<Uint8Array> {
  // TODO: Implement crypto.subtle.importKey and crypto.subtle.sign for HMAC
  throw new Error(
    "computeSubtleHmac: stub implementation pending full cryptographic logic",
  );
}

/**
 * Converts a Uint8Array into a lowercase hexadecimal string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Converts a hex string into a Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}
