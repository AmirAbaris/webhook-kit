# Feature: Universal Webhook Handlers

## Sub-features
- Declarative `createWebhookHandler({ providers, onEvent, onError, filter })`.
- Multi-provider route multiplexing and automatic signature header detection.
- Web Standard `Request` and `Response` interfaces (edge and serverless compatible).
- Automatic body stream cloning (`req.clone()`) to prevent stream consumption issues.
- Automatic HTTP status code generation (`200 OK`, `400 Bad Request`, `401 Unauthorized`).

## How to get to it (user POV)
A developer mounts a single webhook endpoint in Next.js App Router, Hono, Express, or Cloudflare Workers:
```typescript
import { createWebhookHandler } from "@amirabaris/webhook-kit";

export const POST = createWebhookHandler({
  providers: {
    stripe: { secret: process.env.STRIPE_WEBHOOK_SECRET! },
    github: { secret: process.env.GITHUB_WEBHOOK_SECRET! },
  },
  onEvent: async ({ provider, event, payload }) => {
    // Process verified event
  },
});
```

## Driving it with tests
Run:
```bash
pnpm test tests/handler.test.ts tests/extract-body.test.ts
```

## Gotchas
- Must never consume the request stream without cloning (`req.clone()`), or downstream middlewares/handlers will receive an empty or locked stream.
- When `onError` is provided, custom responses can override the default HTTP status codes.
