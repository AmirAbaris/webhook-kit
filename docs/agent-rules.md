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

### ❌ Fatal Mistake: Re-stringifying Parsed JSON

```ts
// ❌ WRONG: Calling .json() parses the payload, stripping whitespace and reordering keys.
// Calling JSON.stringify() produces a DIFFERENT string than the sender sent!
// HMAC check will ALWAYS fail in production.
export async function POST(req: Request) {
  const json = await req.json();
  const signature = req.headers.get("stripe-signature");
  const valid = await verifyWebhookSignature({
    body: JSON.stringify(json), // ❌ BREAKS SIGNATURE VERIFICATION!
    signature,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
}
```

### ✅ Correct Pattern: Capture Raw Body First

```ts
// ✅ CORRECT: Extract raw text or clone the Request stream BEFORE parsing JSON.
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
3. **Replay Attack Mitigation**:
   - Always enforce a timestamp tolerance check when the webhook provider includes a timestamp header (e.g., Stripe `t=...`).
   - Default tolerance: 300 seconds (5 minutes).

---

## 4. Framework Integration Recipes

### Next.js App Router (`app/api/webhook/route.ts`)

```ts
import { verifyWebhookSignature } from "webhook-kit";

export async function POST(req: Request) {
  const signature = req.headers.get("x-signature") ?? "";
  const result = await verifyWebhookSignature({
    body: req, // Web Standard Request can be passed directly!
    signature,
    secret: process.env.WEBHOOK_SECRET!,
  });

  if (!result.valid) {
    return new Response("Unauthorized", { status: 401 });
  }

  return Response.json({ received: true });
}
```

### Hono (Edge / Node / Bun / Cloudflare)

```ts
import { Hono } from "hono";
import { verifyWebhookSignature } from "@amirabaris/webhook-kit";

const app = new Hono();

app.post("/webhook", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-signature") ?? "";

  const result = await verifyWebhookSignature({
    body: rawBody,
    signature,
    secret: process.env.WEBHOOK_SECRET!,
  });

  if (!result.valid) {
    return c.text("Unauthorized", 401);
  }

  return c.json({ success: true });
});
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
- [ ] Are TypeScript types strict (`noImplicitAny`, proper generics on `verifyWebhookSignature<T>`)?
- [ ] Is test coverage included with both valid signatures and tampered payload assertions?
- [ ] Does the commit message strictly follow Conventional Commits?
