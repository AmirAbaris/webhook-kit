# Feature: Web Cryptography Subtle Engine

## Sub-features
- Zero external runtime dependencies: 100% native Web Cryptography API (`globalThis.crypto.subtle`).
- Universal runtime support: Node.js (>=22.0.0), Bun, Deno, Cloudflare Workers, Next.js Edge, and browser.
- High-performance `CryptoKeyLruCache` caching compiled `CryptoKey` instances across repeated requests.
- Non-extractable secret keys (`extractable: false`) preventing in-memory key leakage.
- Constant-time verification (`timingSafeEqual`) accumulating XOR bitwise differences to prevent timing side-channel attacks.
- Robust formatting helpers (`bytesToHex`, `hexToBytes`, `bytesToBase64`, `base64ToBytes`).

## How to get to it (user POV)
Developers can use low-level primitives directly or via the high-level verification API:
```typescript
import { computeSubtleHmac, timingSafeEqual } from "@amirabaris/webhook-kit";

const signature = await computeSubtleHmac("SHA-256", secret, rawBody, "hex");
const isValid = timingSafeEqual(signature, candidateSignature);
```

## Driving it with tests
Run:
```bash
pnpm test tests/crypto.test.ts
```

## Gotchas
- Never import `node:crypto` or `buffer` in core library files.
- `bytesToBase64` processes input in 32 KiB chunks to avoid maximum call stack size limits in V8 and JavaScriptCore engines.
- `timingSafeEqual` seeds mismatch with length inequality and iterates across the full maximum length to prevent early-exit timing leaks.
