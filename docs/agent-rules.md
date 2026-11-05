# Agent Coding & Review Rules: `webhook-kit`

This document defines mandatory guidelines, conventions, and anti-patterns for AI coding assistants (such as Cursor, Claude Code, GitHub Copilot, and Gemini) when writing, refactoring, or reviewing code using or extending `webhook-kit`.

---

## 1. Core Principles & Philosophy

1. **Zero Runtime Dependencies**: `webhook-kit` core has zero third-party dependencies.
2. **Universal Edge Compatibility**: Works identically across Node.js (22+), Bun, Deno, Cloudflare Workers, Next.js Edge, and Fastly Compute.
3. **Web Standards First**: Relies entirely on Web APIs (`crypto.subtle`, `Request`, `Response`, `Headers`, `TextEncoder`, `TextDecoder`, `Uint8Array`). Never import `node:crypto` into core library modules.
4. **Cryptographic Rigor**: All signature verifications and comparisons must be timing-safe to eliminate side-channel vulnerabilities.

---

## 2. The #1 Anti-Pattern: The JSON Re-serialization Trap

### Fatal Mistake: Re-stringifying Parsed JSON

```ts
// WRONG: Calling .json() parses the payload, stripping whitespace and reordering keys.
// Calling JSON.stringify() produces a DIFFERENT string than the sender sent!
// HMAC check will ALWAYS fail in production.
export async function POST(req: Request) {
  const json = await req.json();
  const signature = req.headers.get("stripe-signature");
  const valid = await verifyWebhookSignature({
    body: JSON.stringify(json), // BREAKS SIGNATURE VERIFICATION
    signature,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
}
```

### Correct Pattern: Capture Raw Body First

```ts
// CORRECT: Extract raw text or clone the Request stream BEFORE parsing JSON.
export async function POST(req: Request) {
  const rawBody = await req.text(); // or pass the Request directly to verifyWebhookSignature
  const signature = req.headers.get("stripe-signature")!;

  const result = await verifyWebhookSignature({
    body: rawBody,
    signature,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });

  if (!result.valid) {
    return new Response("Invalid signature", { status: 400 });
  }

  // Safely use typed payload parsed after signature verification
  const payload = result.payload;
}
```

---

## 3. Cryptography Standards

1. **Always Use Constant-Time Equality**:
   - Never use `===` or `!==` for signature verification strings or buffers.
   - Always route comparisons through `timingSafeEqual(expectedBytes, actualBytes)`.
2. **Web Cryptography API**:
   - Use `globalThis.crypto.subtle.importKey(...)` and `globalThis.crypto.subtle.sign(...)`.
   - Never import `node:crypto` into `src/`.
3. **Strict Digest & Signature Format Validation**:
   - Validate signature structure and length before cryptographic checks (e.g., GitHub signatures must be exactly 64 hex characters `^[0-9a-fA-F]{64}$`; Shopify signatures must be 44 Base64 characters).
   - Hex decoding (`hexToBytes`) must strictly reject non-hex characters with a `TypeError` rather than silently zero-filling or coercing.
4. **Replay Attack Mitigation & Idempotency**:
   - Always enforce a timestamp tolerance check when the webhook provider includes a timestamp header (e.g., Stripe `t=...`).
   - Default tolerance: 300 seconds (5 minutes).
   - Both `timestamp` and `toleranceSeconds` must be positive, finite numbers. Reject `NaN`, `Infinity`, or negative values immediately with `TimestampToleranceError`.
   - For deduplication across retries, pass `store: createInMemoryReplayStore()` (includes atomic `setNx` and bounded LRU eviction) or a `WebhookReplayStore` adapter (`has`, `set`, and optional atomic `setNx`) backed by Redis, Upstash, or Cloudflare KV. `webhook-kit` automatically serializes in-flight checks to prevent TOCTOU race conditions under high concurrency.
   - Replay stores and `checkAndRecordReplay` must support both string and numeric `eventId` values (e.g. Shopify numeric order IDs) without skipping idempotency checks.

---

## 4. Framework Integration Recipes

### Next.js App Router (`app/api/webhook/route.ts`)

Prefer `createWebhookHandler` for zero-boilerplate route handlers, or pass the Web Standard `Request` directly to `verifyWebhookSignature`:

```ts
import { createWebhookHandler } from "@amirabaris/webhook-kit";

export const POST = createWebhookHandler({
  provider: "stripe",
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  onEvent: async (event) => {
    // event is strongly typed StripeWebhookEvent
    console.log("Verified Stripe event:", event.id);
  },
});
```

### Hono (Edge / Node / Bun / Cloudflare)

`createWebhookHandler` unwraps Hono's `Context` (`c.req.raw`) and resolves secrets from `c.env`:

```ts
import { Hono } from "hono";
import { createWebhookHandler } from "@amirabaris/webhook-kit";

type Bindings = {
  GITHUB_WEBHOOK_SECRET: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.post(
  "/webhook",
  createWebhookHandler({
    provider: "github",
    secret: (c) => c.env.GITHUB_WEBHOOK_SECRET,
    onEvent: async (event) => {
      console.log("Verified GitHub action:", event.action);
    },
  }),
);
```

---

## 5. Commit & Contribution Rules

When creating commits, PRs, or contributing code to `webhook-kit`:

- **Conventional Commits**: Format strictly as `type(scope): brief description in imperative mood`.
- **Allowed Types**:
  - `feat`: New feature or provider implementation
  - `fix`: Bug fix
  - `docs`: Documentation only changes
  - `test`: Adding or correcting tests
  - `refactor`: Code change that neither fixes a bug nor adds a feature
  - `chore`: Tooling, build config, dependency updates
- **Subject Line**:
  - All lowercase type and scope.
  - Imperative mood (e.g., `feat(crypto): add subtle timing-safe compare`, NOT `added` or `adds`).
  - No trailing period.
  - Commits must be atomic (one single logical concern).

---

## 6. Code Review Checklist for AI Agents

Before generating or approving code:

- [ ] Is raw body retained without intermediate JSON parsing?
- [ ] Are timing-safe comparisons used for all HMAC/signature checks?
- [ ] Is the code free from `node:crypto` imports in universal source code?
- [ ] Are signatures and digests strictly validated for length and character sets before comparison?
- [ ] Are timestamps and tolerance values validated as positive, finite numbers (rejecting `NaN` and `Infinity`)?
- [ ] Does replay protection and event ID resolution support both string and numeric IDs without skipping?
- [ ] Are TypeScript types strict (`noImplicitAny`, proper generics on `verifyWebhookSignature<T>`)?
- [ ] Is test coverage included with both valid signatures and tampered payload assertions?
- [ ] Does the commit message strictly follow Conventional Commits?
