import { ShieldAlert, Server, Database, Cloud } from "lucide-react"
import { CodeBlock } from "@/components/code/code-block"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const IN_MEMORY_STORE_CODE = `import {
  createWebhookHandler,
  createInMemoryReplayStore,
} from "@amirabaris/webhook-kit"

// Bounded in-memory LRU store with automatic TTL cleanup
// Perfect for single-instance Node.js, Bun, or Deno servers
const replayStore = createInMemoryReplayStore({
  maxSize: 10_000,        // Caps memory usage
  defaultTtlSeconds: 300, // 5-minute replay window
})

export const POST = createWebhookHandler({
  provider: "stripe",
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  store: replayStore,
  onEvent: async (event, { eventId }) => {
    // Guaranteed to execute exactly once per unique delivery ID!
    console.log("Safely processing order fulfillment:", eventId)
  },
})`

const UPSTASH_STORE_CODE = `import {
  createWebhookHandler,
  type WebhookReplayStore,
} from "@amirabaris/webhook-kit"
import { Redis } from "@upstash/redis"

// Distributed store for serverless & edge with optional atomic setNx
const redis = Redis.fromEnv()

const upstashStore: WebhookReplayStore = {
  has: async (id) => (await redis.exists(\`wh:replay:\${id}\`)) === 1,
  set: async (id, ttl) =>
    await redis.set(\`wh:replay:\${id}\`, "1", { ex: ttl }),
  setNx: async (id, ttl) => {
    const res = await redis.set(\`wh:replay:\${id}\`, "1", { ex: ttl, nx: true })
    return res !== null
  },
}

export const POST = createWebhookHandler({
  provider: "github",
  secret: process.env.GITHUB_WEBHOOK_SECRET!,
  store: upstashStore,
  onEvent: async (event, { eventId }) => {
    // Automatically extracts X-GitHub-Delivery header as eventId
    console.log("Processing GitHub delivery:", eventId)
  },
})`

const CLOUDFLARE_KV_STORE_CODE = `import {
  createWebhookHandler,
  type WebhookReplayStore,
} from "@amirabaris/webhook-kit"

interface Env {
  GITHUB_WEBHOOK_SECRET: string
  WEBHOOK_REPLAY_KV: KVNamespace
}

// Pass KVNamespace dynamically resolved from Hono Context or Worker env
const createKvStore = (kv: KVNamespace): WebhookReplayStore => ({
  has: async (id) => (await kv.get(\`wh:replay:\${id}\`)) !== null,
  set: async (id, ttl) =>
    await kv.put(\`wh:replay:\${id}\`, "1", {
      expirationTtl: Math.max(60, ttl),
    }),
})

// Hono route integration with dynamic store resolver
app.post(
  "/api/webhook",
  createWebhookHandler({
    provider: "github",
    secret: (c) => c.env.GITHUB_WEBHOOK_SECRET,
    store: (c) => createKvStore(c.env.WEBHOOK_REPLAY_KV),
    onEvent: async (event, { eventId }) => {
      console.log("Unique delivery processed:", eventId)
    },
  })
)`

const STORE_TABS = [
  {
    id: "in-memory",
    label: "In-Memory LRU",
    filename: "app/api/webhook/route.ts",
    code: IN_MEMORY_STORE_CODE,
    badge: "Zero-Dep Built-In",
  },
  {
    id: "upstash",
    label: "Upstash Redis",
    filename: "lib/webhook-store.ts",
    code: UPSTASH_STORE_CODE,
    badge: "Serverless Edge",
  },
  {
    id: "cloudflare-kv",
    label: "Cloudflare Workers KV",
    filename: "src/index.ts",
    code: CLOUDFLARE_KV_STORE_CODE,
    badge: "Global Edge KV",
  },
] as const

export function StoreSection() {
  return (
    <section
      id="store"
      aria-labelledby="store-heading"
      className="border-b border-border/60 py-14 sm:py-20"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <ShieldAlert className="size-3.5" />
            <span>Replay Attack Mitigation</span>
          </div>
          <h2
            id="store-heading"
            className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          >
            Stop duplicate event processing & webhook retry storms
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            When upstream providers retry failed webhooks, network hiccups can
            cause duplicate event execution.{" "}
            <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              webhook-kit
            </code>{" "}
            automatically extracts event delivery IDs from standard headers (
            <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              svix-id
            </code>
            ,{" "}
            <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              X-GitHub-Delivery
            </code>
            ,{" "}
            <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              X-Shopify-Webhook-Id
            </code>
            ,{" "}
            <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              X-Webhook-Id
            </code>
            ) or payload bodies, checks your replay store <strong>after</strong>{" "}
            signature verification, and returns{" "}
            <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              409 Conflict
            </code>{" "}
            on duplicates.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-card/60 p-4">
            <div className="flex items-center gap-2 font-mono text-xs font-semibold text-foreground">
              <Server className="size-4 text-muted-foreground" />
              <span>In-Memory Bounded LRU</span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Built-in zero-dependency store with automatic capacity capping and
              millisecond TTL expiration.
            </p>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-card/60 p-4">
            <div className="flex items-center gap-2 font-mono text-xs font-semibold text-foreground">
              <Database className="size-4 text-muted-foreground" />
              <span>Redis & Upstash</span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              6-line adapter using atomic key existence checks (
              <code className="font-mono text-[11px]">SET EX</code>) for
              serverless instances.
            </p>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-card/60 p-4">
            <div className="flex items-center gap-2 font-mono text-xs font-semibold text-foreground">
              <Cloud className="size-4 text-muted-foreground" />
              <span>Cloudflare Workers KV</span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Direct integration with Edge KV namespaces for globally
              distributed, zero-maintenance idempotency.
            </p>
          </div>
        </div>

        <div className="mt-8">
          <Tabs defaultValue={STORE_TABS[0].id}>
            <TabsList
              aria-label="Replay store adapters"
              className="max-w-full overflow-x-auto"
            >
              {STORE_TABS.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {STORE_TABS.map((tab) => (
              <TabsContent key={tab.id} value={tab.id}>
                <CodeBlock
                  code={tab.code}
                  filename={tab.filename}
                  badge={tab.badge}
                  badgeVariant="success"
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </section>
  )
}
