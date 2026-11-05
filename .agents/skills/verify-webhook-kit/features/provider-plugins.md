# Feature: Provider Adapters & Plugins

## Sub-features
- Built-in provider adapters:
  - **Stripe** (`stripe`): Supports `stripe-signature` scheme parsing (`t=...,v1=...`), multiple signature schemes, and timestamp tolerance validation.
  - **GitHub** (`github`): Supports `x-hub-signature-256` (`sha256=...`) and `x-hub-signature` (`sha1=...`).
  - **Shopify** (`shopify`): Supports `x-shopify-hmac-sha256` base64-encoded digests.
- Automatic header discovery from `Headers` instances or plain header records.
- Generic fallback HMAC verification when no provider is specified.
- Custom `WebhookProviderPlugin` extension interface.

## How to get to it (user POV)
Developers can verify webhooks using unified provider dispatch:
```typescript
import { verifyWebhookSignature, assertWebhookSignature } from "@amirabaris/webhook-kit";

// Stripe example with auto-narrowed StripeWebhookEvent type
const event = await assertWebhookSignature({
  provider: "stripe",
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  body: req,
  headers: req.headers,
  toleranceSeconds: 300,
});
```

## Driving it with tests
Run:
```bash
pnpm test tests/providers.test.ts tests/verify.test.ts
```

## Gotchas
- Stripe signatures concatenate timestamp and body (`${timestamp}.${rawBody}`) for signature computation.
- Shopify signatures are Base64-encoded rather than hexadecimal.
- GitHub signatures typically prefix hexadecimal digests with `sha256=`.
