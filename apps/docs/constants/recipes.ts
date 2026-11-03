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
import { verifyWebhookSignature } from "@amirabaris/webhook-kit"

export async function POST(req: Request) {
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

  const event = result.payload
  return NextResponse.json({ received: true, id: event.id })
}`,
  },
  {
    id: "hono",
    label: "Hono",
    filename: "src/index.ts",
    code: `import { Hono } from "hono"
import { verifyWebhookSignature } from "@amirabaris/webhook-kit"

type Bindings = { GITHUB_WEBHOOK_SECRET: string }
const app = new Hono<{ Bindings: Bindings }>()

app.post("/api/webhook", async (c) => {
  const result = await verifyWebhookSignature({
    body: c.req.raw,
    secret: c.env.GITHUB_WEBHOOK_SECRET,
    provider: "github",
  })

  if (!result.valid) {
    return c.text(\`Unauthorized: \${result.error.message}\`, 401)
  }

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
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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

    return Response.json({ received: true, type: result.payload.type })
  },
}`,
  },
] as const
