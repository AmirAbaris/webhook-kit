# Feature: Stream Cloning & Preservation

## Sub-features
- Automatic stream cloning via `request.clone()` preventing `TypeError: body stream already read` in downstream framework handlers.
- Multi-byte UTF-8 character boundary buffering (preserves split unicode sequences across stream chunk boundaries).
- Universal extraction across Web Standard `Request`, `ReadableStream`, `Uint8Array`, `ArrayBuffer`, and primitive strings.

## How to get to it (user POV)
In Next.js, Hono, or native Fetch handlers, developers pass the raw incoming `Request` to `createWebhookHandler()` or `verifyWebhookSignature()`, and downstream logic or custom middleware can still read the original request body without stream exhaustion.

## Driving it with Stream Preservation Verification
Run:
```bash
node -e '
import { createWebhookHandler, computeSubtleHmac } from "./dist/index.mjs";

async function verifyStreamPreservation() {
  const secret = "whsec_stream_test_secret";
  const rawBody = JSON.stringify({ event: "order.created", item: "🍕 Pizza" });
  const sig = await computeSubtleHmac("SHA-256", secret, rawBody, "hex");
  
  const req = new Request("https://example.com/api/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-webhook-signature": sig,
      "x-webhook-id": "deliv_stream_001",
    },
    body: rawBody,
  });

  let downstreamReadBody = null;

  const handler = createWebhookHandler({
    secret,
    onEvent: async (_payload, { request }) => {
      // Downstream consumer must still be able to clone and read request
      downstreamReadBody = await request.clone().text();
    },
  });

  const res = await handler(req);
  if (res.status !== 200) {
    throw new Error(`Handler failed with status ${res.status}`);
  }

  if (downstreamReadBody !== rawBody) {
    throw new Error(`Stream preservation failed: body mismatch`);
  }

  console.log("✓ Stream preservation invariant passed: body stream readable downstream with UTF-8 integrity.");
}

verifyStreamPreservation();
'
```

## Gotchas
- If the caller pre-consumes the `Request` body stream before passing it into `webhook-kit`, `extractRawBody` raises `PayloadExtractionError` (HTTP 400).
- Handlers should avoid calling `request.text()` directly without `.clone()`.
