import type { Metadata } from "next"
import { CheckCircle2, ShieldAlert, Layers, Bot } from "lucide-react"
import { CodeBlock } from "@/components/code/code-block"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SiteHeader } from "@/components/landing-page/site-header"
import { SiteFooter } from "@/components/landing-page/site-footer"
import { PACKAGE_MANAGERS } from "@/constants/install"
import { SITE } from "@/constants/site"

export const metadata: Metadata = {
  title: `Documentation — ${SITE.name}`,
  description:
    "Minimal, step-by-step guide to verifying webhooks safely across Next.js, Cloudflare Workers, Hono, Node.js, Bun, and Deno.",
}

const CLI_RULE_CODE = `# Autodetect AGENTS.md or CLAUDE.md and inject rules
npx @amirabaris/webhook-kit init-agent

# Or target a specific file
npx @amirabaris/webhook-kit init-agent --target CLAUDE.md`

const VERIFY_SNIPPET = `import { verifyWebhookSignature } from "@amirabaris/webhook-kit"

export async function POST(req: Request) {
  // Pass the raw Request directly — req.clone() is used internally
  // so req.bodyUsed stays false for your downstream logic
  const result = await verifyWebhookSignature({
    body: req,
    provider: "stripe",
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  })

  if (!result.valid) {
    return new Response(\`Unauthorized: \${result.error.message}\`, { status: 401 })
  }

  // Typed payload is parsed only after HMAC check passes
  const event = result.payload
  console.log("Verified event:", event.type)

  return Response.json({ received: true })
}`

const NEXTJS_HANDLER_CODE = `import { createWebhookHandler } from "@amirabaris/webhook-kit"

// Declarative route handler with automatic stream-cloning
export const POST = createWebhookHandler({
  provider: "stripe",
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  onEvent: async (event, { eventId }) => {
    // Verified event payload — original request stream remains unconsumed
    console.log("Processed event:", event.type, eventId)
  },
})`

const HONO_HANDLER_CODE = `import { Hono } from "hono"
import { createWebhookHandler } from "@amirabaris/webhook-kit"

type Bindings = { GITHUB_WEBHOOK_SECRET: string }
const app = new Hono<{ Bindings: Bindings }>()

app.post(
  "/api/webhook",
  createWebhookHandler({
    provider: "github",
    secret: (c) => c.env.GITHUB_WEBHOOK_SECRET,
    onEvent: async (event, { eventId }) => {
      console.log("Processed GitHub delivery:", eventId)
    },
  })
)

export default app`

const CUSTOM_HANDLER_CODE = `import { createWebhookHandler } from "@amirabaris/webhook-kit"

export const POST = createWebhookHandler({
  provider: "custom",
  header: "x-custom-signature",
  secret: process.env.WEBHOOK_SECRET!,
  algorithm: "SHA-256",
  encoding: "hex",
  onEvent: async (payload) => {
    console.log("Processed custom payload:", payload)
  },
})`

const MEMORY_STORE_CODE = `import {
  createWebhookHandler,
  createInMemoryReplayStore,
} from "@amirabaris/webhook-kit"

// Bounded in-memory LRU store with automatic TTL cleanup
// Perfect for single-instance Node.js, Bun, or Deno servers
const store = createInMemoryReplayStore({
  maxSize: 10_000,        // Max items in memory
  defaultTtlSeconds: 300, // 5-minute deduplication window
})

export const POST = createWebhookHandler({
  provider: "stripe",
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  store,
  onEvent: async (event, { eventId }) => {
    // Guaranteed to run once per unique delivery ID
    console.log("Processing order fulfillment:", eventId)
  },
})`

const REDIS_STORE_CODE = `import {
  createWebhookHandler,
  type WebhookReplayStore,
} from "@amirabaris/webhook-kit"
import { Redis } from "@upstash/redis"

const redis = Redis.fromEnv()

// 6-line distributed adapter for serverless & edge (Next.js Edge / Cloudflare)
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

const STEPS = [
  { id: "agents", label: "01. Agentic Flow" },
  { id: "install", label: "02. Install" },
  { id: "verify", label: "03. Verify" },
  { id: "handlers", label: "04. Handlers" },
  { id: "replay", label: "05. Replay Store" },
  { id: "reference", label: "06. Reference" },
] as const

export default function DocsPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
          {/* Docs Header */}
          <div className="border-b border-border/60 pb-8">
            <p className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
              Documentation
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              webhook-kit
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Minimal, edge-compatible webhook verification designed for agentic
              workflows and standard Web Cryptography.
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
                has zero dependencies, ships dual ESM/CJS exports, and includes
                full TypeScript declarations.
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

            {/* Step 3: Signature Verification */}
            <section id="verify" className="py-10 sm:py-12">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-sm bg-muted font-mono text-xs font-semibold text-foreground">
                  3
                </span>
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  Verify raw payload HMAC
                </h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Pass the raw body string, Uint8Array, or Web Standard{" "}
                <code className="font-mono text-xs text-foreground">
                  Request
                </code>{" "}
                directly to{" "}
                <code className="font-mono text-xs text-foreground">
                  verifyWebhookSignature
                </code>
                . When passed a Request, it automatically invokes{" "}
                <code className="font-mono text-xs text-foreground">
                  req.clone()
                </code>{" "}
                so your original request stream remains unconsumed.
              </p>

              <div className="mt-4">
                <CodeBlock
                  code={VERIFY_SNIPPET}
                  filename="app/api/webhook/route.ts"
                  badge="Automatic req.clone()"
                  badgeVariant="success"
                />
              </div>
            </section>

            {/* Step 4: Route Handlers */}
            <section id="handlers" className="py-10 sm:py-12">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-sm bg-muted font-mono text-xs font-semibold text-foreground">
                  4
                </span>
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  Create universal route handlers
                </h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                <code className="font-mono text-xs text-foreground">
                  createWebhookHandler
                </code>{" "}
                combines signature verification, request cloning, and typed
                payload parsing into a declarative route export.
              </p>

              <div className="mt-4">
                <Tabs defaultValue="nextjs">
                  <TabsList aria-label="Framework handlers">
                    <TabsTrigger value="nextjs">Next.js App Router</TabsTrigger>
                    <TabsTrigger value="hono">Hono / Cloudflare</TabsTrigger>
                    <TabsTrigger value="custom">Custom Provider</TabsTrigger>
                  </TabsList>
                  <TabsContent value="nextjs">
                    <CodeBlock
                      code={NEXTJS_HANDLER_CODE}
                      filename="app/api/webhook/route.ts"
                      badge="Zero Stream Lock"
                      badgeVariant="success"
                    />
                  </TabsContent>
                  <TabsContent value="hono">
                    <CodeBlock
                      code={HONO_HANDLER_CODE}
                      filename="src/index.ts"
                      badge="Hono Native"
                    />
                  </TabsContent>
                  <TabsContent value="custom">
                    <CodeBlock
                      code={CUSTOM_HANDLER_CODE}
                      filename="app/api/custom/route.ts"
                      badge="Any HMAC Provider"
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </section>

            {/* Step 5: Replay Protection */}
            <section id="replay" className="py-10 sm:py-12">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-sm bg-muted font-mono text-xs font-semibold text-foreground">
                  5
                </span>
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  Prevent duplicate deliveries & retry storms
                </h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                When upstream providers retry failed webhooks, network hiccups
                can trigger duplicate event execution. Passing a{" "}
                <code className="font-mono text-xs text-foreground">store</code>{" "}
                checks delivery IDs after signature verification and returns{" "}
                <code className="font-mono text-xs text-foreground">
                  409 Conflict
                </code>{" "}
                on duplicates.
              </p>

              <div className="mt-4">
                <Tabs defaultValue="memory">
                  <TabsList aria-label="Replay stores">
                    <TabsTrigger value="memory">In-Memory LRU</TabsTrigger>
                    <TabsTrigger value="redis">
                      Redis / Upstash / KV
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
                  <TabsContent value="redis">
                    <CodeBlock
                      code={REDIS_STORE_CODE}
                      filename="lib/webhook-store.ts"
                      badge="Serverless & Edge"
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </section>

            {/* Step 6: Reference */}
            <section id="reference" className="py-10 sm:py-12">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-sm bg-muted font-mono text-xs font-semibold text-foreground">
                  6
                </span>
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  Reference: Providers & Runtimes
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
                        timestamp tolerance &amp; v1 signature check.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                      <span>
                        <strong className="text-foreground">GitHub</strong>:
                        x-hub-signature-256 HMAC-SHA256 hex.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                      <span>
                        <strong className="text-foreground">Shopify</strong>:
                        x-shopify-hmac-sha256 HMAC-SHA256 base64.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                      <span>
                        <strong className="text-foreground">Custom</strong>:
                        SHA-256, SHA-1, SHA-512 in hex or base64.
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
                        &amp; Edge isolates
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                      <span>
                        <strong className="text-foreground">Next.js</strong>{" "}
                        (Node.js &amp; Edge runtime)
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                      <span>
                        <strong className="text-foreground">Node.js</strong>{" "}
                        (&ge; 18, Web Crypto native)
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-foreground" />
                      <span>
                        <strong className="text-foreground">
                          Bun &amp; Deno
                        </strong>{" "}
                        (zero shims or polyfills)
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
