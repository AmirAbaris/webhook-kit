export const PITFALL = {
  title: "The JSON Re-serialization & Stream Exhaustion Traps",
  subtitle:
    "Parsing incoming requests as JSON strips original whitespace, normalizes numbers, and reorders keys—breaking HMAC checks. Furthermore, reading request bodies consumes the single-use stream, crashing downstream handlers. webhook-kit solves both with byte-preserving automatic stream-cloning.",
  wrong: {
    label: "Broken: Re-stringifying JSON & Consuming Stream",
    filename: "app/api/webhook/route.ts",
    badge: "Always Fails HMAC",
    code: `// Calling .json() strips whitespace, alters bytes, and locks the stream
export async function POST(req: Request) {
  const json = await req.json() // 💥 Consumes stream & reorders keys
  const sig = req.headers.get("x-signature")!

  // JSON.stringify(json) != original signed raw bytes
  const isValid = verify(
    JSON.stringify(json),
    sig,
    process.env.WEBHOOK_SECRET!
  ) // 💥 Always fails! Original body stream is also exhausted.
}`,
  },
  right: {
    label: "Safe: Automatic Stream-Cloning & Constant-Time Check",
    filename: "app/api/webhook/route.ts",
    badge: "Byte-Preserving & Stream-Safe",
    code: `import { verifyWebhookSignature } from "@amirabaris/webhook-kit"

export async function POST(req: Request) {
  // Clones & extracts exact raw bytes via req.clone()
  // req.bodyUsed remains false — original stream is never consumed!
  const result = await verifyWebhookSignature({
    body: req,
    signature: req.headers.get("x-signature")!,
    secret: process.env.WEBHOOK_SECRET!,
  })

  if (!result.valid) {
    return new Response("Unauthorized", { status: 401 })
  }

  // ✅ Typed payload parsed only AFTER valid HMAC check
  const payload = result.payload
  // ✅ Downstream logic can still read req without stream errors
  return Response.json({ received: true })
}`,
  },
} as const
