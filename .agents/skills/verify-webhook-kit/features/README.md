# Feature Map: webhook-kit

This directory contains user-facing feature verification journeys for `webhook-kit`.

## Features
- [Package Distribution & Zero-Dependency Sandbox](./package-distribution.md): Tarball packaging, dual ESM/CJS exports, isolated consumer installation.
- [Agent DX & CLI Tooling](./agent-dx-cli.md): CLI binary commands (`init-agent`, `version`, `help`) and automated agent rules injection.
- [TypeScript Contracts & Type Narrowing](./typescript-contracts.md): Compile-time generic payload narrowing and error types.
- [Web Cryptography & Subtle Primitives](./cryptography-subtle.md): Web Cryptography API (`crypto.subtle`) HMAC engine, constant-time `timingSafeEqual`, strict hex validation, and LRU key cache.
- [Provider Adapters & Signature Formats](./provider-signatures.md): Stripe, GitHub, Shopify providers, strict digest formats, timestamp tolerance bounds, and universal route handlers.
- [Replay Protection & Concurrency Invariants](./replay-store-concurrency.md): Concurrency deduplication (TOCTOU prevention), atomic `setNx`, and $O(N)$ event loop protection.
- [Stream Cloning & Preservation](./stream-preservation.md): Web Standard `Request` stream preservation, multi-byte UTF-8 buffering, and downstream re-readability.
