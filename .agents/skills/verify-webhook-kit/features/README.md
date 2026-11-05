# Feature Map: webhook-kit

This directory contains user-facing feature verification journeys for `webhook-kit`.

## Features
- [Package Distribution & Zero-Dependency Sandbox](./package-distribution.md): Tarball packaging, dual ESM/CJS exports, isolated consumer installation.
- [Agent DX & CLI Tooling](./agent-dx-cli.md): CLI binary commands (`init-agent`, `version`, `help`) and automated agent rules injection.
- [TypeScript Contracts & Type Narrowing](./typescript-contracts.md): Compile-time generic payload narrowing and error types.
- [Universal Webhook Handlers](./webhook-handlers.md): Declarative `createWebhookHandler`, Web standard `Request`/`Response`, and stream cloning safety.
- [Replay Attack Prevention](./replay-store.md): Pluggable `WebhookReplayStore`, `createInMemoryReplayStore`, TTL pruning, and duplicate rejection.
- [Provider Adapters & Plugins](./provider-plugins.md): Built-in Stripe, GitHub, and Shopify plugins with automated signature detection and timestamp tolerance.
- [Web Cryptography Subtle Engine](./crypto-subtle.md): Zero-dependency `crypto.subtle` HMAC calculation, LRU key cache, and constant-time equality.
