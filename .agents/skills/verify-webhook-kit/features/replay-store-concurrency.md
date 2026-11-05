# Feature: Replay Protection & Concurrency Invariants

## Sub-features
- Concurrency deduplication (prevents TOCTOU double-execution on simultaneous delivery of identical event IDs).
- Hardware-level atomic `setNx` on `InMemoryReplayStore` and in-flight promise synchronization for async stores.
- Capacity bounding and fast-path head eviction preventing $O(N)$ event loop freezes under sustained high volume.
- Defensive handling of non-string event IDs, negative TTLs, and `NaN` capacity options.
- Standard webhook header recognition (`svix-id`, `webhook-id`, `x-github-delivery`, `x-shopify-webhook-id`, `x-webhook-id`).

## How to get to it (user POV)
A developer configures `store: createInMemoryReplayStore()` or a distributed `WebhookReplayStore` adapter on `createWebhookHandler()` or `verifyWebhookSignature()` to automatically reject duplicate webhook deliveries with `ReplayAttackError` (`409 Conflict`).

## Driving it with Concurrency & Invariant Verification
Run the dedicated concurrency stress test:
```bash
node -e '
import { InMemoryReplayStore, checkAndRecordReplay, ReplayAttackError } from "./dist/index.mjs";

async function verifyConcurrency() {
  const store = new InMemoryReplayStore();
  const eventId = "evt_verify_concurrent_drive";
  
  // Fire 10 simultaneous replay checks for the same event ID
  const results = await Promise.all(
    Array.from({ length: 10 }, () => checkAndRecordReplay({ store, eventId, storeTtlSeconds: 60 }))
  );
  
  const successes = results.filter(r => r === null).length;
  const rejections = results.filter(r => r instanceof ReplayAttackError).length;
  
  if (successes !== 1 || rejections !== 9) {
    throw new Error(`Concurrency invariant violated: expected 1 success and 9 rejections, got ${successes} successes and ${rejections} rejections`);
  }
  
  console.log("✓ Concurrency deduplication invariant passed: exactly 1 accepted, 9 rejected.");
}

verifyConcurrency();
'
```

## Gotchas
- Multi-instance serverless deployments require an atomic `setNx` implementation (e.g. Redis `SET NX`) or distributed locking to prevent inter-process race conditions.
- If a custom store only implements `has` and `set`, `webhook-kit` provides process-local in-flight deduplication via `inFlightPerStore`.
