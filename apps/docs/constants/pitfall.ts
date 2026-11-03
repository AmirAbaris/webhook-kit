export const PITFALL = {
  title: "The JSON Re-serialization Trap",
  subtitle:
    "Parsing incoming requests as JSON strips original whitespace, normalizes numbers, and reorders keys. Re-stringifying produces different bytes than the sender signed—breaking HMAC verification every time.",
  wrong: {
    label: "Broken: Re-stringifying parsed JSON",
    filename: "app/api/webhook/route.ts",
    badge: "Always Fails HMAC",
    code: `// Calling .json() strips whitespace & reorders keys
export async function POST(req: Request) {
  const json = await req.json()
  const sig = req.headers.get("x-signature")!

  // JSON.stringify(json) != original raw payload bytes
  const isValid = verify(
    JSON.stringify(json),
    sig,
    process.env.WEBHOOK_SECRET!
  )
}`,
  },
  right: {
    label: "Safe: Direct Web Standard Request verification",
    filename: "app/api/webhook/route.ts",
    badge: "Byte-Preserving & Constant-Time",
    code: `import { verifyWebhookSignature } from "@amirabaris/webhook-kit"

export async function POST(req: Request) {
  const result = await verifyWebhookSignature({
    body: req, // Clones & reads exact raw bytes first
    signature: req.headers.get("x-signature")!,
    secret: process.env.WEBHOOK_SECRET!,
  })

  if (!result.valid) {
    return new Response("Unauthorized", { status: 401 })
  }

  // Typed payload parsed only AFTER valid HMAC check
  const payload = result.payload
  return Response.json({ received: true })
}`,
  },
} as const
