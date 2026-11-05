---
name: verify-webhook-kit
description: "Verify webhook-kit library, dual packaging (ESM/CJS), zero-dependency tarball sandbox, type narrowing, route handlers, replay attack stores, provider plugins, and CLI agent-rules injection."
---

# Verify webhook-kit

Use this skill to verify `webhook-kit` from a user's perspective across its dual package distribution, TypeScript typings, zero-dependency WebCrypto guarantees, universal route handlers, replay attack prevention, and CLI developer tooling.

## 1. Surface

`webhook-kit` provides:
1. **The Core Library Package**: Dual ESM (`dist/index.mjs`) and CommonJS (`dist/index.cjs` / `dist/index.js`) with full type declarations (`dist/index.d.ts`, `dist/index.d.mts`, `dist/index.d.cts`) targeting Node.js (>=22.0.0), Bun, Deno, Cloudflare Workers, Next.js Edge, and browser/edge runtimes.
2. **Universal Route Handlers**: Declarative multi-provider handler (`createWebhookHandler`) with standard Web `Request`/`Response` integration, stream cloning (`req.clone()`), and automated status responses.
3. **Provider Plugins**: Built-in verification adapters for Stripe (`stripe`), GitHub (`github`), and Shopify (`shopify`), featuring automated header detection and timestamp tolerance enforcement.
4. **Replay Attack Prevention**: Pluggable idempotency store interface (`WebhookReplayStore`) and memory store implementation (`InMemoryReplayStore`, `createInMemoryReplayStore`) with automated TTL pruning.
5. **Web Cryptography Primitives**: Zero-dependency `crypto.subtle` engine (`computeSubtleHmac`, `timingSafeEqual`) with non-extractable keys and in-memory LRU key caching.
6. **The Developer CLI**: Zero-dependency binary (`bin/webhook-kit.mjs` or `npx @amirabaris/webhook-kit init-agent`).

## 2. Launch & Build

Before driving verification, compile the distribution artifacts and type declarations:

```bash
pnpm build
```

Verify ready state:
- Check that `dist/index.mjs`, `dist/index.cjs`, and `dist/index.d.ts` exist.
- Ensure declaration maps (`.d.ts.map`, `.d.mts.map`, `.d.cts.map`) are emitted.

## 3. Doctor

Run this quick check to confirm the environment, dependencies, AST lint rules, statement spacing, and full test-suite types are healthy:

```bash
node -v && pnpm -v && pnpm lint
```
- Node must be >= 22.0.0
- `oxlint` (correctness & cyclomatic complexity ≤ 7), `eslint` (`@stylistic/padding-line-between-statements`, `no-restricted-imports` forbidding `node:crypto` / `node:buffer`), Prettier formatting, and strict TypeScript typechecking across `src/`, `tests/`, and `tests-d/` (`tsconfig.lint.json`) must all pass with exit code 0.

## 4. Drive & Evidence

Execute the end-to-end verification harness across 6 key dimensions:

### A. Zero-Dependency Tarball Sandbox Verification
Verify that packing the project into a `.tgz` tarball and installing it into a fresh, isolated temporary consumer project installs **only** `@amirabaris/webhook-kit` and zero phantom dependencies:

```bash
pnpm test:smoke
```

**Evidence to Observe:**
- Tarball packed into temporary sandbox directory.
- `node_modules` contains exactly 1 package (`@amirabaris/webhook-kit`).
- ESM exports imported and confirmed.
- CommonJS require loaded and confirmed.
- Sandbox cleanly removed.

### B. Unit & Provider Specification Tests
Run the test runner to verify behavior specifications across crypto primitives, stream cloning, replay stores, providers, handlers, and generic verification:

```bash
pnpm test
```

### C. Compile-Time Type Narrowing
Run `tsd` to verify TypeScript generics, provider payload narrowing, and error hierarchies:

```bash
pnpm test:types
```

### D. Universal Webhook Handler & Stream Safety
Verify that `createWebhookHandler` correctly dispatches requests, handles errors, and clones `Request` streams safely without consuming the body:

```bash
pnpm test tests/handler.test.ts tests/extract-body.test.ts
```

### E. Replay Prevention & Idempotency Store
Verify that `createInMemoryReplayStore` detects duplicate webhooks within tolerance windows:

```bash
pnpm test tests/store.test.ts
```

### F. CLI Rule Injection Driving
Verify that the `webhook-kit init-agent` CLI safely injects rules into agent files:

```bash
node ./bin/webhook-kit.mjs init-agent --target /tmp/test-verify-agent.md
grep "webhook-kit-agent-rules:start" /tmp/test-verify-agent.md
rm /tmp/test-verify-agent.md
```

## 5. Architectural Invariants & Best Practices

When contributing or auditing:
1. **Never import `node:crypto` or `buffer` in `src/`**: Always use `globalThis.crypto.subtle`, `Uint8Array`, and standard Web APIs.
2. **Never parse JSON before signature verification**: Consuming or parsing JSON strips whitespace and reorders keys, breaking cryptographic HMAC checks. Always extract raw text or pass the raw `Request`.
3. **Constant-time comparison**: Never use `===` or `!==` for HMAC digests. Always use `timingSafeEqual`.
4. **Complexity discipline**: Functions must maintain cyclomatic complexity ≤ 7 (enforced by `oxlint`/`eslint`).
5. **Statement spacing**: Maintain vertical separation between top-level declarations and overloads as enforced by `@stylistic/padding-line-between-statements`.

## 6. Cleanup

After running verification:
- Temporary smoke directories are automatically removed by `tests/package-smoke.mjs`.
- Remove any temporary test files in `/tmp`.
