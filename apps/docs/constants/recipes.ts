export interface RecipeItem {
  id: string
  label: string
  filename: string
  code: string
}

export const RECIPES: readonly RecipeItem[] = [
  {
    id: "nextjs",
    label: "Next.js App Router",
    filename: "app/api/webhook/route.ts",
    code: `import { NextResponse } from "next/server"
import { createWebhookHandler, verifyWebhookSignature } from "@amirabaris/webhook-kit"

// Option A: 3-line declarative route handler with automatic stream-cloning
export const POST = createWebhookHandler({
  provider: "stripe",
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  onEvent: async (event, { rawBody, request }) => {
    // Webhook stream was cloned via request.clone() — original request is untouched
    console.log("Verified Stripe event:", event.type, event.id)
  },
})

// Option B: Manual verification with automatic stream-cloning guarantee
export async function manualPOST(req: Request) {
  // Pass Web Standard Request directly.
  // webhook-kit calls req.clone().text() internally so req.bodyUsed stays false.
  const result = await verifyWebhookSignature({
    body: req,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
    provider: "stripe",
    toleranceSeconds: 300,
  })

  if (!result.valid) {
    return new NextResponse(\`Webhook Error: \${result.error.message}\`, {
      status: 400,
    })
  }

  // Safe: req.bodyUsed is still false.
  // Downstream telemetry or req.json() can still execute safely:
  // const json = await req.json()

  const event = result.payload
  return NextResponse.json({ received: true, id: event.id })
}`,
  },
  {
    id: "hono",
    label: "Hono",
    filename: "src/index.ts",
    code: `import { Hono } from "hono"
import { createWebhookHandler, verifyWebhookSignature } from "@amirabaris/webhook-kit"

type Bindings = { GITHUB_WEBHOOK_SECRET: string }
const app = new Hono<{ Bindings: Bindings }>()

// Option A: Declarative route handler (unwraps c.req.raw & resolves dynamic secrets)
app.post(
  "/api/webhook",
  createWebhookHandler({
    provider: "github",
    secret: (c) => c.env.GITHUB_WEBHOOK_SECRET,
    onEvent: async (event, { request }) => {
      // request.bodyUsed remains false thanks to internal stream-cloning
      console.log("Verified GitHub webhook:", event.action)
    },
  })
)

// Option B: Manual verification with automatic stream-cloning
app.post("/api/webhook-manual", async (c) => {
  // Pass c.req.raw directly — stream is cloned and c.req remains unconsumed
  const result = await verifyWebhookSignature({
    body: c.req.raw,
    secret: c.env.GITHUB_WEBHOOK_SECRET,
    provider: "github",
  })

  if (!result.valid) {
    return c.text(\`Unauthorized: \${result.error.message}\`, 401)
  }

  // Safe: c.req.raw was preserved; subsequent Hono plugins or c.req.json() work normally
  return c.json({ received: true, action: result.payload.action })
})

export default app`,
  },
  {
    id: "cloudflare-workers",
    label: "Cloudflare Workers",
    filename: "src/worker.ts",
    code: `import { verifyWebhookSignature } from "@amirabaris/webhook-kit"

interface Env {
  STRIPE_WEBHOOK_SECRET: string
  INTERNAL_API_URL: string
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/api/webhook") {
      return new Response("Not Found", { status: 404 })\n    }

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
      return new Response(\`Unauthorized: \${result.error.message}\`, {
        status: 401,
      })
    }

    // Safe: request.bodyUsed is still false.
    // Forward the original, unconsumed request directly to an internal service or queue:
    const upstreamResponse = await fetch(env.INTERNAL_API_URL, request)

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: upstreamResponse.headers,
    })
  },
}`,
  },
  {
    id: "handler",
    label: "Universal Route Handler",
    filename: "app/api/webhook/route.ts",
    code: `import {
  createWebhookHandler,
  createInMemoryReplayStore,
} from "@amirabaris/webhook-kit"

// Universal 3-line handler for Next.js App Router, Hono, Remix, and Bun
export const POST = createWebhookHandler({
  provider: "stripe",
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  // Pluggable replay protection against duplicate event delivery & retry storms
  store: createInMemoryReplayStore({ maxSize: 10_000, defaultTtlSeconds: 300 }),
  onEvent: async (event, { eventId, rawBody }) => {
    // Strongly typed event payload (StripeWebhookEvent)
    // Automatically returns 200 { received: true } upon completion
    console.log(\`Processing unique event \${eventId}:\`, event.type)
  },
  // Automatically returns 401 on bad signature, 400 on bad payload, 409 on duplicate replay
})`,
  },
  {
    id: "store",
    label: "Replay Store (KV/Redis)",
    filename: "lib/webhook-store.ts",
    code: `import {
  createWebhookHandler,
  type WebhookReplayStore,
} from "@amirabaris/webhook-kit"
import { Redis } from "@upstash/redis"

// Distributed replay store adapter for multi-instance serverless deployments
const redis = Redis.fromEnv()

const upstashStore: WebhookReplayStore = {
  has: async (id) => (await redis.exists(\`wh:replay:\${id}\`)) === 1,
  set: async (id, ttl) => await redis.set(\`wh:replay:\${id}\`, "1", { ex: ttl }),
}

export const POST = createWebhookHandler({
  provider: "github",
  secret: process.env.GITHUB_WEBHOOK_SECRET!,
  store: upstashStore, // Automatic eventId extraction from headers or payload
  onEvent: async (event, { eventId }) => {
    console.log("Safely processed idempotent event:", eventId)
  },
})`,
  },
] as const
