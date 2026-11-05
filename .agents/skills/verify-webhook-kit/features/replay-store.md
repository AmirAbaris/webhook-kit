# Feature: Replay Attack Prevention & Idempotency Store

## Sub-features
- In-memory event ID tracking (`InMemoryReplayStore`, `createInMemoryReplayStore`).
- Automated sliding window timestamp validation (`toleranceSeconds`, default: 300s).
- Automatic TTL cleanup to prevent unbounded memory growth.
- Pluggable `WebhookReplayStore` interface for distributed backends (Redis, Cloudflare KV, Upstash).
- `ReplayAttackError` rejection on duplicate event arrival.

## How to get to it (user POV)
A developer configures replay prevention either globally on handlers or per-verification:
```typescript
import {
  createInMemoryReplayStore,
  verifyWebhookSignature,
} from "@amirabaris/webhook-kit";

const store = createInMemoryReplayStore({ cleanupIntervalMs: 60_000 });

const result = await verifyWebhookSignature({
  provider: "stripe",
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  body: req,
  store,
  storeTtlSeconds: 600,
});
```

## Driving it with tests
Run:
```bash
pnpm test tests/store.test.ts
```

## Gotchas
- An event ID is only valid within the tolerance window. Events with timestamps older than `toleranceSeconds` are rejected with `TimestampToleranceError` before reaching the replay store.
- Custom stores must implement `has(eventId)` and `set(eventId, expiresAt)`.
