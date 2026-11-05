# Feature: Web Cryptography & Subtle Primitives

## Sub-features
- Universal HMAC computation via Web Cryptography API (`globalThis.crypto.subtle`).
- Constant-time string and buffer comparison (`timingSafeEqual`) to prevent side-channel leaks.
- Length-mismatch seeding and full iteration across maximum input length.
- Strict hexadecimal decoding (`hexToBytes`) requiring valid hex digits `^[0-9a-fA-F]*$` and throwing `TypeError` on invalid characters.
- Odd-length hex padding with a leading zero.
- In-memory LRU key caching (`CryptoKeyLruCache`) to reuse imported keys across concurrent requests.
- Cache capacity sanitization bounding maximum key count to a positive integer.
- Automatic eviction of rejected key import promises to avoid caching failures.

## How to get to it (user POV)
Developers and provider plugins call `computeSubtleHmac`, `timingSafeEqual`, and `hexToBytes` directly from `@amirabaris/webhook-kit`. All operations run natively in Node.js, Bun, Deno, Cloudflare Workers, and Edge runtimes without `node:crypto`.

## Driving it with Cryptography Verification
Run this command to verify Web Crypto HMAC hashing, constant-time equality, and strict hex decoding:
```bash
node -e '
import { computeSubtleHmac, timingSafeEqual, hexToBytes, bytesToHex, CryptoKeyLruCache } from "./dist/index.mjs";

async function verifyCryptoPrimitives() {
  // 1. Verify timingSafeEqual correctness and length-mismatch safety
  if (!timingSafeEqual("hello-world-signature", "hello-world-signature")) {
    throw new Error("timingSafeEqual rejected identical strings.");
  }
  if (timingSafeEqual("signature-a", "signature-b")) {
    throw new Error("timingSafeEqual accepted distinct strings.");
  }
  if (timingSafeEqual("short", "longer-string")) {
    throw new Error("timingSafeEqual accepted mismatched lengths.");
  }

  // 2. Verify RFC 4231 test vector for HMAC-SHA256
  const key = "Jefe";
  const data = "what do ya want for nothing?";
  const expectedHmac = "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843";
  const actualHmac = await computeSubtleHmac("SHA-256", key, data, "hex");
  if (actualHmac !== expectedHmac) {
    throw new Error(`HMAC mismatch: expected ${expectedHmac}, got ${actualHmac}`);
  }

  // 3. Verify strict hex validation rejecting invalid characters
  let threwInvalidHex = false;
  try {
    hexToBytes("invalid-hex-characters-xyz!");
  } catch (err) {
    if (err instanceof TypeError) {
      threwInvalidHex = true;
    }
  }
  if (!threwInvalidHex) {
    throw new Error("hexToBytes accepted invalid hex characters without throwing TypeError.");
  }

  // 4. Verify odd-length hex padding
  const paddedBytes = hexToBytes("abc");
  if (bytesToHex(paddedBytes) !== "0abc") {
    throw new Error("hexToBytes failed to pad odd-length hex strings with a leading zero.");
  }

  // 5. Verify CryptoKeyLruCache bounded capacity
  const cache = new CryptoKeyLruCache(2);
  const dummyKey = Promise.resolve({});
  cache.set("k1", dummyKey);
  cache.set("k2", dummyKey);
  cache.set("k3", dummyKey);
  if (cache.get("k1") !== undefined || cache.get("k3") === undefined) {
    throw new Error("CryptoKeyLruCache failed LRU eviction bound.");
  }

  console.log("✓ Web Cryptography and subtle primitives verified successfully.");
}

verifyCryptoPrimitives();
'
```

## Gotchas
- Never import `node:crypto` into `src/`.
- Hex strings starting with `0x` are automatically normalized before parsing.
- Malformed hex characters must raise `TypeError` rather than producing invalid bytes.
