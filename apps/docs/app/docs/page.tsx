import type { Metadata } from "next"
import {
  CheckCircle2,
  ShieldAlert,
  Layers,
  Bot,
  AlertTriangle,
  RefreshCw,
} from "lucide-react"
import { CodeBlock } from "@/components/code/code-block"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SiteHeader } from "@/components/landing-page/site-header"
import { SiteFooter } from "@/components/landing-page/site-footer"
import { PACKAGE_MANAGERS } from "@/constants/install"
import { SITE } from "@/constants/site"

export const metadata: Metadata = {
  title: `Documentation — ${SITE.name}`,
  description:
    "Complete guide to verifying webhooks safely: 3-line route handlers, automatic stream cloning, exception & functional patterns, replay attack stores, and AI agent guardrails.",
}

const CLI_RULE_CODE = `# Autodetect AGENTS.md or CLAUDE.md and inject rules
npx @amirabaris/webhook-kit init-agent

# Or target a specific agent file
npx @amirabaris/webhook-kit init-agent --target CLAUDE.md
npx @amirabaris/webhook-kit init-agent --target AGENTS.md`

const VERIFY_FUNCTIONAL_CODE = `import { verifyWebhookSignature } from "@amirabaris/webhook-kit"

export async function POST(req: Request) {
  // Pass the raw Request directly — req.clone() is used internally
  // so req.bodyUsed stays false for downstream middleware or logging
  const result = await verifyWebhookSignature({
    body: req,
    provider: "stripe", // Built-in: 'stripe' | 'github' | 'shopify' (or generic HMAC)
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
    toleranceSeconds: 300, // Replay attack protection window
  })

  // Discriminated union narrowing:
  if (!result.valid) {
    // result.error is strongly typed WebhookKitError with machine-readable code
    console.error("Verification failed:", result.error.code, result.error.message)
    return new Response(\`Unauthorized: \${result.error.message}\`, { status: 401 })
  }

  // result.payload is safely parsed and typed only after valid HMAC verification
  const event = result.payload
  console.log("Verified event:", event.type, event.id)

  return Response.json({ received: true, id: event.id })
}`

const VERIFY_ASSERT_CODE = `import {
  assertWebhookSignature,
  SignatureVerificationError,
  TimestampToleranceError,
  InvalidSignatureHeaderError,
  PayloadExtractionError,
  ReplayAttackError,
} from "@amirabaris/webhook-kit"

export async function POST(req: Request) {
  try {
    // Direct typed payload return on success; throws typed WebhookKitError on failure
    const event = await assertWebhookSignature({
      body: req,
      provider: "stripe",
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
      toleranceSeconds: 300,
    })

    // Direct access to verified payload
    console.log("Verified event:", event.type, event.id)
    return Response.json({ received: true, id: event.id })
  } catch (err) {
    if (err instanceof TimestampToleranceError) {
      // Timestamp outside tolerance window: possible replay attack or clock drift
      console.warn(\`Timestamp expired: \${err.timestamp} vs tolerance \${err.toleranceSeconds}s\`)
      return new Response("Webhook timestamp expired", { status: 400 })
    }

    if (err instanceof ReplayAttackError) {
      // Duplicate event delivery detected in replay store
      console.warn(\`Duplicate event rejected: \${err.eventId}\`)
      return new Response("Duplicate webhook event", { status: 409 })
    }

    if (err instanceof SignatureVerificationError) {
      // HMAC digest mismatch or wrong secret
      return new Response("Invalid signature", { status: 401 })
    }

    if (err instanceof InvalidSignatureHeaderError) {
      // Missing or malformed header
      return new Response("Malformed signature header", { status: 400 })
    }

    if (err instanceof PayloadExtractionError) {
      // Body stream could not be read
      return new Response("Invalid request payload", { status: 400 })
    }

    return new Response("Internal Server Error", { status: 500 })
  }
}`

const NEXTJS_HANDLER_CODE = `// app/api/webhook/route.ts
import { createWebhookHandler } from "@amirabaris/webhook-kit"

// Declarative 3-line route handler for Next.js App Router
// Automatically clones request stream, verifies HMAC, and dispatches typed event
export const POST = createWebhookHandler({
  provider: "stripe",
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  onEvent: async (event, { rawBody, request, eventId }) => {
    // event is strongly typed StripeWebhookEvent
    // request.bodyUsed remains false thanks to automatic stream-cloning!
    switch (event.type) {
      case "checkout.session.completed":
        console.log("Fulfilling checkout session:", event.data.object.id)
        break
      default:
        console.log(\`Unhandled event type: \${event.type}\`)
    }
  },
  // Automatically returns:
  // - 200 { received: true } on success
  // - 401 Unauthorized on invalid signature / missing header
  // - 400 Bad Request on stream extraction error
  // - 409 Conflict on duplicate replay event
})`

const HONO_HANDLER_CODE = `// src/index.ts
import { Hono } from "hono"
import { createWebhookHandler } from "@amirabaris/webhook-kit"

type Bindings = { GITHUB_WEBHOOK_SECRET: string }
const app = new Hono<{ Bindings: Bindings }>()

// Natively unwraps Hono Context, clones c.req.raw, and resolves dynamic secrets
app.post(
  "/api/webhook",
  createWebhookHandler({
    provider: "github",
    secret: (c) => c.env.GITHUB_WEBHOOK_SECRET, // Dynamic secret resolver
    onEvent: async (event, { request, eventId }) => {
      // event is strongly typed GithubWebhookEvent
      // request.bodyUsed is false — Hono context is completely undisturbed
      console.log("Verified GitHub delivery:", eventId, event.action)
    },
  })
)

export default app`

const CLOUDFLARE_HANDLER_CODE = `// src/worker.ts
import { verifyWebhookSignature } from "@amirabaris/webhook-kit"

interface Env {
  STRIPE_WEBHOOK_SECRET: string
  INTERNAL_API_URL: string
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/api/webhook") {
      return new Response("Not Found", { status: 404 })
    }

    // Automatic Stream-Cloning:
    // Cloudflare Workers isolates strictly lock streams once read.
    // webhook-kit automatically calls request.clone(), leaving request.bodyUsed === false.
    const result = await verifyWebhookSignature({
      body: request,
      secret: env.STRIPE_WEBHOOK_SECRET,
      provider: "stripe",
      toleranceSeconds: 300,
    })

    if (!result.valid) {
      return new Response(\`Unauthorized: \${result.error.message}\`, { status: 401 })
    }

    // Safe: request.bodyUsed is still false!
    // Forward the original, unconsumed request directly to an internal service or queue:
    const upstreamResponse = await fetch(env.INTERNAL_API_URL, request)

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: upstreamResponse.headers,
    })
  },
}`

const EXPRESS_HANDLER_CODE = `// server.ts
import express from "express"
import { verifyWebhookSignature } from "@amirabaris/webhook-kit"

const app = express()

// CRITICAL: Webhook routes must receive raw payload bytes (Buffer)
// Register this handler BEFORE any global express.json() middleware!
app.post(
  "/api/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    // req.body is a raw Buffer (Uint8Array), preserving original byte sequence
    const result = await verifyWebhookSignature({
      body: req.body,
      headers: req.headers, // webhook-kit inspects headers for signature and timestamp
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
      provider: "stripe",
    })

    if (!result.valid) {
      console.error("Verification failed:", result.error.message)
      return res.status(400).send(\`Webhook Error: \${result.error.message}\`)
    }

    // result.payload is safely parsed and typed
    console.log("Verified event:", result.payload.type)
    return res.json({ received: true })
  }
)

// Global JSON middleware for standard API endpoints
app.use(express.json())

app.listen(3000, () => console.log("Server listening on port 3000"))`

const NODE_HTTP_HANDLER_CODE = `// server.mjs
import http from "node:http"
import { verifyWebhookSignature } from "@amirabaris/webhook-kit"

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/webhook") {
    // Buffer raw incoming stream chunks to preserve exact byte sequence
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
    }
    const rawBody = Buffer.concat(chunks)

    const result = await verifyWebhookSignature({
      body: rawBody,
      headers: req.headers,
      secret: process.env.WEBHOOK_SECRET!,
      provider: "shopify", // Automatically verifies X-Shopify-Hmac-Sha256 (Base64)
    })

    if (!result.valid) {
      res.writeHead(400, { "Content-Type": "text/plain" })
      return res.end(\`Verification failed: \${result.error.message}\`)
    }

    res.writeHead(200, { "Content-Type": "application/json" })
    return res.end(JSON.stringify({ received: true }))
  }

  res.writeHead(404).end()
})

server.listen(3000)`

const CUSTOM_HANDLER_CODE = `// app/api/custom/route.ts
import { createWebhookHandler } from "@amirabaris/webhook-kit"

// Generic HMAC verification for any custom webhook provider
export const POST = createWebhookHandler({
  secret: process.env.WEBHOOK_SECRET!,
  algorithm: "SHA-256", // "SHA-256" | "SHA-384" | "SHA-512" | "SHA-1"
  encoding: "hex",      // "hex" | "base64"
  toleranceSeconds: 300, // Validates x-webhook-timestamp / x-timestamp
  onEvent: async (payload, { rawBody, timestamp }) => {
    console.log("Processed custom payload:", payload, "timestamp:", timestamp)
  },
  // Optional custom error responder
  onError: (error, { request }) => {
    console.error("Custom error handler:", error.code, error.message)
    return Response.json({ error: error.message }, { status: 401 })
  },
})`

const MEMORY_STORE_CODE = `import {
  createWebhookHandler,
  createInMemoryReplayStore,
} from "@amirabaris/webhook-kit"

// Bounded in-memory LRU store with automatic TTL cleanup
// Perfect for single-instance Node.js, Bun, or Deno servers
const store = createInMemoryReplayStore({
  maxSize: 10_000,        // Max items in memory (LRU eviction)
  defaultTtlSeconds: 300, // 5-minute deduplication window
})

export const POST = createWebhookHandler({
  provider: "stripe",
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  store,
  onEvent: async (event, { eventId }) => {
    // Automatically extracts eventId from headers (X-GitHub-Delivery, X-Shopify-Webhook-Id)
    // or payload.id (e.g. evt_...). Rejects duplicate calls with 409 Conflict.
    console.log("Processing order fulfillment once:", eventId)
  },
})`

const UPSTASH_STORE_CODE = `import {
  createWebhookHandler,
  type WebhookReplayStore,
} from "@amirabaris/webhook-kit"
import { Redis } from "@upstash/redis"

const redis = Redis.fromEnv()

// 6-line distributed adapter for serverless & edge (Next.js Edge / Cloudflare / Vercel)
const upstashStore: WebhookReplayStore = {
  has: async (id) => (await redis.exists(\`wh:replay:\${id}\`)) === 1,
  set: async (id, ttl) => await redis.set(\`wh:replay:\${id}\`, "1", { ex: ttl }),
}

export const POST = createWebhookHandler({
  provider: "github",
  secret: process.env.GITHUB_WEBHOOK_SECRET!,
  store: upstashStore,
  onEvent: async (event, { eventId }) => {
    console.log("Safely processing unique delivery:", eventId)
  },
})`

const REDIS_STORE_CODE = `import {
  createWebhookHandler,
  type WebhookReplayStore,
} from "@amirabaris/webhook-kit"
import Redis from "ioredis"

const redis = new Redis(process.env.REDIS_URL!)

// Node.js & Bun Redis adapter (ioredis or node-redis)
const redisStore: WebhookReplayStore = {
  has: async (id) => (await redis.exists(\`wh:replay:\${id}\`)) === 1,
  set: async (id, ttl) => await redis.set(\`wh:replay:\${id}\`, "1", "EX", ttl),
}

export const POST = createWebhookHandler({
  provider: "stripe",
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  store: redisStore,
  onEvent: async (event, { eventId }) => {
    console.log("Unique delivery processed:", eventId)
  },
})`

const CLOUDFLARE_KV_STORE_CODE = `import type { WebhookReplayStore } from "@amirabaris/webhook-kit"

// Cloudflare Workers KV adapter (KV minimum TTL is 60 seconds)
export const createCloudflareKvStore = (kv: KVNamespace): WebhookReplayStore => ({
  has: async (id) => (await kv.get(\`wh:replay:\${id}\`)) !== null,
  set: async (id, ttl) =>
    await kv.put(\`wh:replay:\${id}\`, "1", {
      expirationTtl: Math.max(60, ttl),
    }),
})`

const CUSTOM_PLUGIN_CODE = `import type {
  WebhookProviderPlugin,
  WebhookVerifyOptions,
  WebhookVerificationResult,
} from "@amirabaris/webhook-kit"
import { computeSubtleHmac, timingSafeEqual } from "@amirabaris/webhook-kit"

// Extensible provider plugin interface
export const customSmsPlugin: WebhookProviderPlugin<{ messageId: string }> = {
  name: "custom-sms",
  async verify(options: WebhookVerifyOptions): Promise<WebhookVerificationResult<{ messageId: string }>> {
    // 1. Compute expected HMAC with Web Cryptography API
    const expected = await computeSubtleHmac(
      "SHA-256",
      options.secret,
      options.rawBody ?? "",
      "hex"
    )

    // 2. Timing-safe equality check
    const valid = timingSafeEqual(expected, options.signature ?? "")

    if (!valid) {
      return {
        valid: false,
        rawBody: options.rawBody ?? "",
        error: new SignatureVerificationError(),
      }
    }

    return {
      valid: true,
      rawBody: options.rawBody ?? "",
      payload: { messageId: "msg_123" },
    }
  },
}`

const ERROR_ROWS = [
  {
    errorClass: "SignatureVerificationError",
    code: "SIGNATURE_VERIFICATION_FAILED",
    status: "401",
    cause:
      "HMAC digest mismatch or wrong signing secret. Check that your secret is configured correctly.",
  },
  {
    errorClass: "TimestampToleranceError",
    code: "TIMESTAMP_TOLERANCE_EXCEEDED",
    status: "401",
    cause:
      "Payload timestamp outside toleranceSeconds window. Protects against replay attacks and clock drift.",
  },
  {
    errorClass: "ReplayAttackError",
    code: "WEBHOOK_REPLAY_DETECTED",
    status: "409",
    cause:
      "Event ID was already processed in store. Prevents duplicate webhook side effects during retry storms.",
  },
  {
    errorClass: "InvalidSignatureHeaderError",
    code: "INVALID_SIGNATURE_HEADER",
    status: "401",
    cause:
      "Header is missing, empty, or lacks required prefix (sha256=, t=...,v1=...).",
  },
  {
    errorClass: "PayloadExtractionError",
    code: "PAYLOAD_EXTRACTION_FAILED",
    status: "400",
    cause:
      "Request body is an unsupported format or input stream was prematurely closed.",
  },
  {
    errorClass: "WebhookKitError",
    code: "WEBHOOK_KIT_ERROR",
    status: "500",
    cause:
      "Base class for all webhook-kit errors. Contains code and message properties.",
  },
] as const

const STEPS = [
  { id: "agents", label: "01. Agentic Flow" },
  { id: "install", label: "02. Install" },
  { id: "verify", label: "03. Verification Patterns" },
  { id: "handlers", label: "04. Route Handlers & Recipes" },
  { id: "replay", label: "05. Replay Attack Store" },
  { id: "errors", label: "06. Error Hierarchy" },
  { id: "reference", label: "07. Providers & Runtimes" },
] as const

export default function DocsPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
          {/* Docs Header */}
          <div className="border-b border-border/60 pb-8">
            <div className="flex items-center gap-2 font-mono text-xs tracking-wider text-muted-foreground uppercase">
              <span>Documentation</span>
              <span>·</span>
              <span className="text-foreground">{SITE.version}</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              webhook-kit
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Zero-dependency, edge-compatible webhook signature verification
              and declarative route handlers powered by standard Web
              Cryptography (
              <code className="font-mono text-xs text-foreground">
                crypto.subtle
              </code>
              ). Designed for agentic workflows, automatic stream-cloning, and
              pluggable replay defense.
            </p>

            {/* Step jump navigation */}
            <div className="mt-6 flex flex-wrap items-center gap-1.5">
              {STEPS.map((step) => (
                <a
                  key={step.id}
                  href={`#${step.id}`}
                  className="rounded-md border border-border/80 bg-muted/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {step.label}
                </a>
              ))}
            </div>
          </div>

          <div className="divide-y divide-border/60">
            {/* Step 1: Agentic Flow */}
            <section id="agents" className="py-10 sm:py-12">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-sm bg-muted font-mono text-xs font-semibold text-foreground">
                  1
                </span>
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  Agentic Flow: Configure AI Guardrails First
                </h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                AI coding agents (Claude Code, Cursor, Copilot, Codex)
                frequently break webhook endpoints by calling{" "}
                <code className="font-mono text-xs text-foreground">
                  await req.json()
                </code>{" "}
                before checking HMAC signatures or attempting to import{" "}
                <code className="font-mono text-xs text-foreground">
                  node:crypto
                </code>
                .
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Run this CLI command first in your project repository. It
                autodetects{" "}
                <code className="font-mono text-xs text-foreground">
                  AGENTS.md
                </code>{" "}
                or{" "}
                <code className="font-mono text-xs text-foreground">
                  CLAUDE.md
                </code>{" "}
                and injects idempotent verification rules so your coding agents
                generate correct, stream-safe code automatically:
              </p>

              <div className="mt-4">
                <CodeBlock
                  code={CLI_RULE_CODE}
                  language="bash"
                  filename="terminal"
                  badge="Zero-Dep CLI"
                />
              </div>

              <div className="mt-4 rounded-lg border border-border/70 bg-card/60 p-3.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2 font-mono font-medium text-foreground">
                  <Bot className="size-3.5 text-muted-foreground" />
                  <span>What the injected rules enforce:</span>
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    Pass the raw Request or byte string directly — never parse
                    JSON before signature verification.
                  </li>
                  <li>
                    Rely on Web Cryptography (
                    <code className="font-mono text-[11px] text-foreground">
                      crypto.subtle
                    </code>
                    ) for universal edge compatibility.
                  </li>
                  <li>
                    Leverage automatic stream-cloning so downstream logic never
                    encounters a locked stream.
                  </li>
                </ul>
              </div>
            </section>

            {/* Step 2: Install */}
            <section id="install" className="py-10 sm:py-12">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-sm bg-muted font-mono text-xs font-semibold text-foreground">
                  2
                </span>
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  Install the package
                </h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                <code className="font-mono text-xs text-foreground">
                  @amirabaris/webhook-kit
                </code>{" "}
                has zero runtime dependencies, ships dual ESM/CJS exports, and
                includes full TypeScript declarations.
              </p>

              <div className="mt-4">
                <Tabs defaultValue={PACKAGE_MANAGERS[0].id}>
                  <TabsList aria-label="Package managers">
                    {PACKAGE_MANAGERS.map((pm) => (
                      <TabsTrigger key={pm.id} value={pm.id}>
                        {pm.id}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {PACKAGE_MANAGERS.map((pm) => (
                    <TabsContent key={pm.id} value={pm.id}>
                      <CodeBlock
                        code={pm.command}
                        language="bash"
                        filename={`terminal (${pm.id})`}
                      />
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            </section>

            {/* Step 3: Verification Patterns */}
            <section id="verify" className="py-10 sm:py-12">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-sm bg-muted font-mono text-xs font-semibold text-foreground">
                  3
                </span>
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  Verification Patterns: Functional vs Exception
                </h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                webhook-kit provides two verification styles to match your
                preferred control flow:
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
                <li>
                  <strong className="text-foreground">
                    Functional Pattern (
                    <code className="font-mono text-xs text-foreground">
                      verifyWebhookSignature
                    </code>
                    )
                  </strong>
                  : Returns a discriminated union (
                  <code className="font-mono text-xs text-foreground">
                    result.valid
                  </code>
                  ) for strict compiler narrowing without exceptions.
                </li>
                <li>
                  <strong className="text-foreground">
                    Exception Pattern (
                    <code className="font-mono text-xs text-foreground">
                      assertWebhookSignature
                    </code>
                    )
                  </strong>
                  : Returns the strongly typed payload directly or throws
                  specific, typed{" "}
                  <code className="font-mono text-xs text-foreground">
                    WebhookKitError
                  </code>{" "}
                  subclasses for centralized{" "}
                  <code className="font-mono text-xs text-foreground">
                    try / catch
                  </code>{" "}
                  handling.
                </li>
              </ul>

              <div className="mt-6">
                <Tabs defaultValue="functional">
                  <TabsList aria-label="Verification patterns">
                    <TabsTrigger value="functional">
                      1. Functional (Discriminated Union)
                    </TabsTrigger>
                    <TabsTrigger value="assert">
                      2. Exception (assertWebhookSignature)
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="functional">
                    <CodeBlock
                      code={VERIFY_FUNCTIONAL_CODE}
                      filename="app/api/webhook/route.ts"
                      badge="Discriminated Union"
                      badgeVariant="success"
                    />
                  </TabsContent>
                  <TabsContent value="assert">
                    <CodeBlock
                      code={VERIFY_ASSERT_CODE}
                      filename="app/api/webhook/route.ts"
                      badge="Throws Typed Errors"
                      badgeVariant="default"
                    />
                  </TabsContent>
                </Tabs>
              </div>

              {/* Automatic stream cloning explanation */}
              <div className="mt-4 rounded-lg border border-border/70 bg-card/60 p-3.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2 font-mono font-medium text-foreground">
                  <RefreshCw className="size-3.5 text-emerald-500" />
                  <span>Automatic Stream-Cloning Guarantee:</span>
                </div>
                <p className="mt-1.5 leading-relaxed">
                  When you pass a Web Standard{" "}
                  <code className="font-mono text-[11px] text-foreground">
                    Request
                  </code>{" "}
                  to any verification function, webhook-kit internally calls{" "}
                  <code className="font-mono text-[11px] text-foreground">
                    req.clone().text()
                  </code>
                  . The original request body stream remains unconsumed (
                  <code className="font-mono text-[11px] text-foreground">
                    req.bodyUsed === false
                  </code>
                  ), allowing downstream proxies, middleware, or{" "}
                  <code className="font-mono text-[11px] text-foreground">
                    await req.json()
                  </code>{" "}
                  to execute safely without throwing{" "}
                  <em>&ldquo;Body already consumed&rdquo;</em>.
                </p>
              </div>
            </section>

            {/* Step 4: Route Handlers & Framework Recipes */}
            <section id="handlers" className="py-10 sm:py-12">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-sm bg-muted font-mono text-xs font-semibold text-foreground">
                  4
                </span>
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  Route Handlers & Framework Recipes
                </h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Use{" "}
                <code className="font-mono text-xs text-foreground">
                  createWebhookHandler
                </code>{" "}
                to create drop-in route handlers with automatic stream-cloning,
                HMAC verification, replay detection, and automatic HTTP status
                mapping (
                <code className="font-mono text-xs text-foreground">401</code>,{" "}
                <code className="font-mono text-xs text-foreground">400</code>,{" "}
                <code className="font-mono text-xs text-foreground">409</code>).
              </p>

              <div className="mt-4">
                <Tabs defaultValue="nextjs">
                  <TabsList aria-label="Framework recipes">
                    <TabsTrigger value="nextjs">Next.js App Router</TabsTrigger>
                    <TabsTrigger value="hono">Hono</TabsTrigger>
                    <TabsTrigger value="cloudflare">
                      Cloudflare Workers
                    </TabsTrigger>
                    <TabsTrigger value="express">Express</TabsTrigger>
                    <TabsTrigger value="node-http">Node.js HTTP</TabsTrigger>
                    <TabsTrigger value="custom">Custom Provider</TabsTrigger>
                  </TabsList>
                  <TabsContent value="nextjs">
                    <CodeBlock
                      code={NEXTJS_HANDLER_CODE}
                      filename="app/api/webhook/route.ts"
                      badge="3-Line Next.js Route"
                      badgeVariant="success"
                    />
                  </TabsContent>
                  <TabsContent value="hono">
                    <CodeBlock
                      code={HONO_HANDLER_CODE}
                      filename="src/index.ts"
                      badge="Hono Native Context"
                    />
                  </TabsContent>
                  <TabsContent value="cloudflare">
                    <CodeBlock
                      code={CLOUDFLARE_HANDLER_CODE}
                      filename="src/worker.ts"
                      badge="Stream Proxy Forwarding"
                    />
                  </TabsContent>
                  <TabsContent value="express">
                    <CodeBlock
                      code={EXPRESS_HANDLER_CODE}
                      filename="server.ts"
                      badge="Raw Buffer Handling"
                      badgeVariant="default"
                    />
                  </TabsContent>
                  <TabsContent value="node-http">
                    <CodeBlock
                      code={NODE_HTTP_HANDLER_CODE}
                      filename="server.mjs"
                      badge="Vanilla node:http"
                    />
                  </TabsContent>
                  <TabsContent value="custom">
                    <CodeBlock
                      code={CUSTOM_HANDLER_CODE}
                      filename="app/api/custom/route.ts"
                      badge="Generic HMAC"
                    />
                  </TabsContent>
                </Tabs>
              </div>

              {/* Express warning note */}
              <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2 font-mono font-medium text-amber-500">
                  <AlertTriangle className="size-3.5" />
                  <span>Express & Node Body Parser Pitfall:</span>
                </div>
                <p className="mt-1.5 leading-relaxed">
                  In Express servers, global{" "}
                  <code className="font-mono text-[11px] text-foreground">
                    app.use(express.json())
                  </code>{" "}
                  re-encodes incoming JSON and alters raw bytes, breaking HMAC
                  checks. Always register webhook routes with{" "}
                  <code className="font-mono text-[11px] text-foreground">
                    express.raw(&#123; type: &quot;application/json&quot;
                    &#125;)
                  </code>{" "}
                  <strong>before</strong> any global body-parsing middleware.
                </p>
              </div>
            </section>

            {/* Step 5: Replay Attack Defense & Idempotency Store */}
            <section id="replay" className="py-10 sm:py-12">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-sm bg-muted font-mono text-xs font-semibold text-foreground">
                  5
                </span>
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  Replay Attack Defense &amp; Idempotency Store
                </h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                When upstream providers retry failed webhooks, network hiccups
                can cause duplicate event executions (like double billing or
                repeated order fulfillment). webhook-kit employs two layers of
                defense:
              </p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
                <li>
                  <strong className="text-foreground">
                    Timestamp Tolerance Window
                  </strong>
                  : Validates delivery timestamps against{" "}
                  <code className="font-mono text-xs text-foreground">
                    toleranceSeconds
                  </code>{" "}
                  (default 300s).
                </li>
                <li>
                  <strong className="text-foreground">
                    Pluggable Replay Store (
                    <code className="font-mono text-xs text-foreground">
                      store
                    </code>
                    )
                  </strong>
                  : Automatically extracts the event ID (from headers like{" "}
                  <code className="font-mono text-xs text-foreground">
                    X-GitHub-Delivery
                  </code>
                  ,{" "}
                  <code className="font-mono text-xs text-foreground">
                    X-Shopify-Webhook-Id
                  </code>
                  , or{" "}
                  <code className="font-mono text-xs text-foreground">
                    payload.id
                  </code>
                  ) and rejects duplicates with{" "}
                  <code className="font-mono text-xs text-foreground">
                    409 Conflict
                  </code>{" "}
                  (
                  <code className="font-mono text-xs text-foreground">
                    ReplayAttackError
                  </code>
                  ).
                </li>
              </ol>

              <div className="mt-6">
                <Tabs defaultValue="memory">
                  <TabsList aria-label="Replay stores">
                    <TabsTrigger value="memory">In-Memory LRU</TabsTrigger>
                    <TabsTrigger value="upstash">Upstash Redis</TabsTrigger>
                    <TabsTrigger value="redis">ioredis / Node</TabsTrigger>
                    <TabsTrigger value="cloudflare-kv">
                      Cloudflare KV
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="memory">
                    <CodeBlock
                      code={MEMORY_STORE_CODE}
                      filename="app/api/webhook/route.ts"
                      badge="Zero-Dep Built-In"
                      badgeVariant="success"
                    />
                  </TabsContent>
                  <TabsContent value="upstash">
                    <CodeBlock
                      code={UPSTASH_STORE_CODE}
                      filename="lib/webhook-store.ts"
                      badge="Serverless & Edge"
                    />
                  </TabsContent>
                  <TabsContent value="redis">
                    <CodeBlock
                      code={REDIS_STORE_CODE}
                      filename="lib/webhook-store.ts"
                      badge="Node / Bun Redis"
                    />
                  </TabsContent>
                  <TabsContent value="cloudflare-kv">
                    <CodeBlock
                      code={CLOUDFLARE_KV_STORE_CODE}
                      filename="lib/webhook-store.ts"
                      badge="Edge Workers KV"
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </section>

            {/* Step 6: Error Hierarchy & Error Codes */}
            <section id="errors" className="py-10 sm:py-12">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-sm bg-muted font-mono text-xs font-semibold text-foreground">
                  6
                </span>
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  Error Hierarchy &amp; Machine-Readable Codes
                </h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                All errors inherit from{" "}
                <code className="font-mono text-xs text-foreground">
                  WebhookKitError
                </code>{" "}
                and carry machine-readable{" "}
                <code className="font-mono text-xs text-foreground">code</code>{" "}
                properties for programmatic handling:
              </p>

              <div className="mt-6 overflow-x-auto rounded-xl border border-border/80 bg-card/60">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border/80 bg-muted/40 font-mono text-muted-foreground">
                    <tr>
                      <th className="px-3.5 py-2.5 font-medium">Error Class</th>
                      <th className="px-3.5 py-2.5 font-medium">Error Code</th>
                      <th className="px-3.5 py-2.5 font-medium">HTTP Status</th>
                      <th className="px-3.5 py-2.5 font-medium">
                        Cause &amp; Mitigation
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {ERROR_ROWS.map((row) => (
                      <tr key={row.errorClass} className="hover:bg-muted/20">
                        <td className="px-3.5 py-3 font-mono font-medium text-foreground">
                          {row.errorClass}
                        </td>
                        <td className="px-3.5 py-3 font-mono text-[11px] text-muted-foreground">
                          {row.code}
                        </td>
                        <td className="px-3.5 py-3">
                          <span
                            className={`inline-block rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold ${
                              row.status === "409"
                                ? "border border-amber-500/20 bg-amber-500/10 text-amber-500"
                                : row.status === "401"
                                  ? "border border-red-500/20 bg-red-500/10 text-red-500"
                                  : "border border-border bg-muted text-muted-foreground"
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-3.5 py-3 text-muted-foreground">
                          {row.cause}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Step 7: Providers & Runtimes Reference */}
            <section id="reference" className="py-10 sm:py-12">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-sm bg-muted font-mono text-xs font-semibold text-foreground">
                  7
                </span>
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  Reference: Providers &amp; Runtimes
                </h2>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border/80 bg-card/60 p-4">
                  <div className="flex items-center gap-2 font-mono text-xs font-semibold text-foreground">
                    <Layers className="size-4 text-muted-foreground" />
                    <span>Built-in Providers</span>
                  </div>
                  <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                      <span>
                        <strong className="text-foreground">Stripe</strong>:
                        Parses{" "}
                        <code className="font-mono text-[11px]">
                          Stripe-Signature
                        </code>{" "}
                        (timestamp{" "}
                        <code className="font-mono text-[11px]">t=...</code> +
                        HMAC{" "}
                        <code className="font-mono text-[11px]">v1=...</code>),
                        typed{" "}
                        <code className="font-mono text-[11px]">
                          StripeWebhookEvent
                        </code>
                        .
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                      <span>
                        <strong className="text-foreground">GitHub</strong>:
                        Parses{" "}
                        <code className="font-mono text-[11px]">
                          x-hub-signature-256
                        </code>{" "}
                        (
                        <code className="font-mono text-[11px]">
                          sha256=...
                        </code>{" "}
                        hex), auto-extracts{" "}
                        <code className="font-mono text-[11px]">
                          x-github-delivery
                        </code>
                        , typed{" "}
                        <code className="font-mono text-[11px]">
                          GithubWebhookEvent
                        </code>
                        .
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                      <span>
                        <strong className="text-foreground">Shopify</strong>:
                        Parses{" "}
                        <code className="font-mono text-[11px]">
                          x-shopify-hmac-sha256
                        </code>{" "}
                        (Base64 HMAC-SHA256), auto-extracts{" "}
                        <code className="font-mono text-[11px]">
                          x-shopify-webhook-id
                        </code>
                        , typed{" "}
                        <code className="font-mono text-[11px]">
                          ShopifyWebhookEvent
                        </code>
                        .
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                      <span>
                        <strong className="text-foreground">
                          Custom / Generic HMAC
                        </strong>
                        : Supports SHA-256, SHA-384, SHA-512, and SHA-1 in hex
                        or base64.
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="rounded-xl border border-border/80 bg-card/60 p-4">
                  <div className="flex items-center gap-2 font-mono text-xs font-semibold text-foreground">
                    <ShieldAlert className="size-4 text-muted-foreground" />
                    <span>Supported Runtimes</span>
                  </div>
                  <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                      <span>
                        <strong className="text-foreground">
                          Cloudflare Workers
                        </strong>{" "}
                        &amp; Edge isolates (native Web Crypto, zero Node
                        polyfills).
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                      <span>
                        <strong className="text-foreground">Next.js</strong>{" "}
                        (Node.js &amp; Edge runtimes with App Router Request).
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                      <span>
                        <strong className="text-foreground">Node.js</strong>{" "}
                        (&ge; 22.0.0, native{" "}
                        <code className="font-mono text-[11px]">
                          globalThis.crypto.subtle
                        </code>
                        ).
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                      <span>
                        <strong className="text-foreground">
                          Bun &amp; Deno
                        </strong>{" "}
                        (native Web Cryptography &amp; Web Standards, zero
                        shims).
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Custom Provider Plugin Interface */}
              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Extensible Plugin Architecture
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    WebhookProviderPlugin Interface
                  </span>
                </div>
                <CodeBlock
                  code={CUSTOM_PLUGIN_CODE}
                  filename="lib/custom-plugin.ts"
                  badge="Custom Plugin"
                />
              </div>
            </section>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
