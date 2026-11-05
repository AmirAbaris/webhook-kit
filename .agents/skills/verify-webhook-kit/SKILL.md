---
name: verify-webhook-kit
description: "Verify webhook-kit library, dual packaging (ESM/CJS), zero-dependency tarball sandbox, type narrowing, replay store concurrency invariants, and CLI agent-rules injection."
---

# Verify webhook-kit

Use this skill to verify `webhook-kit` from a user's perspective across its dual package distribution, TypeScript typings, zero-dependency guarantees, replay store concurrency invariants, and CLI developer tooling.

## 1. Surface

`webhook-kit` has five primary user surfaces:
1. **The Library Package**: Dual ESM (`dist/index.mjs`) and CommonJS (`dist/index.cjs`) exports consumed in Node, Bun, Deno, and Edge environments.
2. **Provider Adapters & Universal Route Handler**: First-party providers (`stripe`, `github`, `shopify`), custom plugins, and 3-line declarative route handlers (`createWebhookHandler`).
3. **Web Cryptography Primitives**: `crypto.subtle` HMAC engine, constant-time `timingSafeEqual`, strict digest sanitizers, and bounded LRU `CryptoKey` caching.
4. **Replay & Idempotency Store**: Bounded in-memory store and distributed adapters with atomic concurrency deduplication.
5. **The Developer CLI**: Zero-dependency binary (`bin/webhook-kit.mjs` or `npx webhook-kit init-agent`).

## 2. Launch & Build

Before driving verification, compile the distribution artifacts and type declarations:

```bash
pnpm build
```

Verify ready state:
- Check that `dist/index.mjs`, `dist/index.cjs`, `dist/index.d.mts`, and `dist/index.d.cts` exist.

## 3. Doctor

Run this quick check to confirm the environment, dependencies, AST lint rules, statement spacing, and full test-suite types are healthy:

```bash
node -v && pnpm -v && pnpm lint
```
- Node must be >= 22.0.0
- `oxlint` (correctness & cyclomatic complexity ≤ 7), `eslint` (`@stylistic/padding-line-between-statements`, `no-restricted-imports` for `node:crypto`), Prettier formatting, and strict TypeScript typechecking across `src/`, `tests/`, and `tests-d/` (`tsconfig.lint.json`) must all pass with exit code 0.

## 4. Drive & Evidence

Execute the end-to-end verification harness across 7 key dimensions:

### A. Zero-Dependency Tarball Sandbox Verification
Verify that packing the project into a `.tgz` tarball and installing it into a fresh, isolated temporary consumer project installs **only** `webhook-kit` and no phantom dependencies:

```bash
pnpm test:smoke
```

**Evidence to Observe:**
- Tarball packed into temporary sandbox directory.
- `node_modules` contains exactly 1 package (`webhook-kit`).
- ESM and CommonJS exports imported and confirmed.
- Sandbox cleanly removed.

### B. Unit & Provider Specification Tests
Run the test runner to verify behavior specifications, input hardening (strict 64-char hex / 44-char base64 digest formats, non-finite timestamp rejection), and numeric event ID replay handling:

```bash
pnpm test
```

### C. Compile-Time Type Narrowing
Run `tsd` to verify TypeScript generics and payload type-narrowing:

```bash
pnpm test:types
```

### D. Replay Concurrency & Deduplication Invariant
Verify that concurrent duplicate webhook deliveries for the same event ID are atomically deduplicated without TOCTOU race conditions:

```bash
node -e '
import { InMemoryReplayStore, checkAndRecordReplay, ReplayAttackError } from "./dist/index.mjs";

async function verifyConcurrency() {
  const store = new InMemoryReplayStore();
  const eventId = "evt_verify_concurrent_harness";
  
  const results = await Promise.all(
    Array.from({ length: 10 }, () => checkAndRecordReplay({ store, eventId, storeTtlSeconds: 60 }))
  );
  
  const successes = results.filter(r => r === null).length;
  const rejections = results.filter(r => r instanceof ReplayAttackError).length;
  
  if (successes !== 1 || rejections !== 9) {
    throw new Error(`Concurrency race condition detected: ${successes} succeeded, ${rejections} rejected`);
  }
  
  console.log("✓ Concurrency invariant verified: exactly 1 accepted, 9 rejected.");
}

verifyConcurrency();
'
```

### E. Stream Cloning & Downstream Re-Readability Invariant
Verify that `createWebhookHandler` preserves the Web Standard `Request` stream via `request.clone()` so downstream handlers can still consume the body:

```bash
node -e '
import { createWebhookHandler, computeSubtleHmac } from "./dist/index.mjs";

async function verifyStreamPreservation() {
  const secret = "whsec_stream_harness_secret";
  const rawBody = JSON.stringify({ event: "order.created", item: "🍕 Pizza" });
  const sig = await computeSubtleHmac("SHA-256", secret, rawBody, "hex");
  
  const req = new Request("https://example.com/api/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": sig,
      "x-webhook-id": "deliv_stream_harness",
    },
    body: rawBody,
  });

  let downstreamBody = null;
  const handler = createWebhookHandler({
    secret,
    onEvent: async (_payload, { request }) => {
      downstreamBody = await request.clone().text();
    },
  });

  const res = await handler(req);
  if (res.status !== 200 || downstreamBody !== rawBody) {
    throw new Error("Stream preservation failed");
  }

  console.log("✓ Stream preservation invariant verified: request body remains readable downstream.");
}

verifyStreamPreservation();
'
```

### F. CLI Rule Injection Driving
Verify that the `webhook-kit init-agent` CLI safely injects rules into agent files:

```bash
node ./bin/webhook-kit.mjs init-agent --target /tmp/test-verify-agent.md
grep -q "webhook-kit-agent-rules:start" /tmp/test-verify-agent.md
rm /tmp/test-verify-agent.md
```

### G. Cryptographic Primitives & Format Hardening Invariant
Verify that `timingSafeEqual` enforces timing safety across unequal lengths, `hexToBytes` strictly rejects invalid hex characters with `TypeError`, and Stripe timestamp tolerance rejects non-finite values (`NaN`, `Infinity`):

```bash
node -e '
import {
  computeSubtleHmac,
  timingSafeEqual,
  hexToBytes,
  validateTimestampTolerance,
  TimestampToleranceError,
  parseGithubSignature,
  InvalidSignatureHeaderError,
} from "./dist/index.mjs";

async function verifyCryptoAndHardening() {
  // 1. Verify timingSafeEqual on identical strings and length mismatches
  if (!timingSafeEqual("sig_test_a", "sig_test_a") || timingSafeEqual("sig_test_a", "sig_test_b") || timingSafeEqual("short", "longer_sig")) {
    throw new Error("timingSafeEqual failed equality or length-mismatch safety");
  }

  // 2. Verify strict hex validation rejecting invalid characters
  let caughtHex = false;
  try {
    hexToBytes("not_valid_hex_!!!");
  } catch (err) {
    if (err instanceof TypeError) caughtHex = true;
  }
  if (!caughtHex) throw new Error("hexToBytes did not reject invalid hex with TypeError");

  // 3. Verify timestamp tolerance non-finite rejection
  let caughtTimestamp = false;
  try {
    validateTimestampTolerance(NaN, 300);
  } catch (err) {
    if (err instanceof TimestampToleranceError) caughtTimestamp = true;
  }
  if (!caughtTimestamp) throw new Error("validateTimestampTolerance did not reject NaN");

  // 4. Verify GitHub strict 64-character hex format
  let caughtGithub = false;
  try {
    parseGithubSignature("sha256=too_short");
  } catch (err) {
    if (err instanceof InvalidSignatureHeaderError) caughtGithub = true;
  }
  if (!caughtGithub) throw new Error("parseGithubSignature did not reject invalid length");

  console.log("✓ Web Crypto & format hardening invariants verified.");
}

verifyCryptoAndHardening();
'
```

## 5. Cleanup

After running verification:
- Temporary smoke directories are automatically removed by `tests/package-smoke.mjs`.
- Remove any temporary test files in `/tmp`.
