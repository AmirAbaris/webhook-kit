import { describe, expect, test } from "vitest";
import {
  computeSubtleHmac,
  createWebhookHandler,
  InvalidSignatureHeaderError,
  PayloadExtractionError,
  SignatureVerificationError,
  TimestampToleranceError,
  type WebhookLikeContext,
  type WebhookProviderPlugin,
  type WebhookVerifyOptions,
} from "../src/index.js";

const STRIPE_SECRET = "whsec_handler_stripe_secret";
const GITHUB_SECRET = "gh_handler_webhook_secret";
const SHOPIFY_SECRET = "shpss_handler_webhook_secret";
const GENERIC_SECRET = "generic_handler_webhook_secret";

interface MockHonoContext extends WebhookLikeContext {
  readonly env: {
    readonly STRIPE_WEBHOOK_SECRET: string;
    readonly GITHUB_WEBHOOK_SECRET: string;
  };
}

async function createStripeRequest(
  payload: Record<string, unknown>,
  timestamp = 1700000000,
  secret = STRIPE_SECRET,
): Promise<Request> {
  const rawBody = JSON.stringify(payload);
  const sig = await computeSubtleHmac(
    "SHA-256",
    secret,
    `${timestamp}.${rawBody}`,
    "hex",
  );

  return new Request("https://example.com/api/webhooks/stripe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": `t=${timestamp},v1=${sig}`,
    },
    body: rawBody,
  });
}

async function createGithubRequest(
  payload: Record<string, unknown>,
  secret = GITHUB_SECRET,
): Promise<Request> {
  const rawBody = JSON.stringify(payload);
  const sig = await computeSubtleHmac("SHA-256", secret, rawBody, "hex");

  return new Request("https://example.com/api/webhooks/github", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": `sha256=${sig}`,
    },
    body: rawBody,
  });
}

async function createShopifyRequest(
  payload: Record<string, unknown>,
  secret = SHOPIFY_SECRET,
): Promise<Request> {
  const rawBody = JSON.stringify(payload);
  const sig = await computeSubtleHmac("SHA-256", secret, rawBody, "base64");

  return new Request("https://example.com/api/webhooks/shopify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": sig,
    },
    body: rawBody,
  });
}

describe("createWebhookHandler", () => {
  test("verifies Stripe Request and returns default 200 { received: true } when onEvent returns void", async () => {
    let capturedId = "";
    let capturedTimestamp: number | undefined;
    const timestamp = 1700000000;

    const POST = createWebhookHandler({
      provider: "stripe",
      secret: STRIPE_SECRET,
      currentTimestamp: timestamp + 10,
      onEvent: async (event, meta) => {
        capturedId = event.id;
        capturedTimestamp = meta.timestamp;
      },
    });

    const request = await createStripeRequest(
      {
        id: "evt_stripe_01",
        object: "event",
        type: "checkout.session.completed",
        created: timestamp,
        data: { object: { id: "cs_123" } },
      },
      timestamp,
    );

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(await response.json()).toEqual({ received: true });
    expect(capturedId).toBe("evt_stripe_01");
    expect(capturedTimestamp).toBe(timestamp);
  });

  test("unwraps Hono context { req: { raw: Request } } and resolves secret dynamically", async () => {
    let seenAction = "";
    let seenEnvSecret = "";

    const handler = createWebhookHandler({
      provider: "github",
      secret: (c: MockHonoContext) => c.env.GITHUB_WEBHOOK_SECRET,
      onEvent: async (event, { context }) => {
        seenAction = String(event.action);
        seenEnvSecret = context.env.GITHUB_WEBHOOK_SECRET;

        return { ok: true, action: event.action };
      },
    });

    const request = await createGithubRequest({
      action: "opened",
      repository: { full_name: "acme/repo" },
    });

    const honoContext: MockHonoContext = {
      req: { raw: request },
      env: {
        STRIPE_WEBHOOK_SECRET: STRIPE_SECRET,
        GITHUB_WEBHOOK_SECRET: GITHUB_SECRET,
      },
    };

    const response = await handler(honoContext);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, action: "opened" });
    expect(seenAction).toBe("opened");
    expect(seenEnvSecret).toBe(GITHUB_SECRET);
  });

  test("supports async secret resolver and Shopify provider verification", async () => {
    const handler = createWebhookHandler({
      provider: "shopify",
      secret: async (_ctx, req) => {
        const shopDomain = req.headers.get("x-shopify-shop-domain");

        return shopDomain === "acme.myshopify.com" ? SHOPIFY_SECRET : "wrong";
      },
      onEvent: (event) => ({
        orderId: event.id,
      }),
    });

    const baseReq = await createShopifyRequest({ id: 987654, currency: "USD" });
    const headers = new Headers(baseReq.headers);
    headers.set("x-shopify-shop-domain", "acme.myshopify.com");

    const request = new Request(baseReq.url, {
      method: "POST",
      headers,
      body: await baseReq.text(),
    });

    const response = await handler(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ orderId: 987654 });
  });

  test("supports custom WebhookProviderPlugin and passes through custom Response from onEvent", async () => {
    interface CustomEvent {
      customId: string;
    }

    const customPlugin: WebhookProviderPlugin<
      CustomEvent,
      WebhookVerifyOptions
    > = {
      name: "custom-provider",
      async verify() {
        return {
          valid: true,
          rawBody: '{"customId":"cust_42"}',
          payload: { customId: "cust_42" },
          timestamp: 1700000123,
        };
      },
    };

    const handler = createWebhookHandler({
      provider: customPlugin,
      secret: "unused",
      onEvent: (event) =>
        new Response(`Accepted:${event.customId}`, {
          status: 202,
          headers: { "x-custom-id": event.customId },
        }),
    });

    const request = new Request("https://example.com/webhooks/custom", {
      method: "POST",
      body: '{"customId":"cust_42"}',
    });

    const response = await handler(request);

    expect(response.status).toBe(202);
    expect(response.headers.get("x-custom-id")).toBe("cust_42");
    expect(await response.text()).toBe("Accepted:cust_42");
  });

  test("supports generic HMAC verification with custom encoding and algorithm", async () => {
    const rawBody = '{"event":"user.created","userId":"u_1"}';
    const sig = await computeSubtleHmac(
      "SHA-256",
      GENERIC_SECRET,
      rawBody,
      "base64",
    );

    const handler = createWebhookHandler<{ event: string; userId: string }>({
      secret: new TextEncoder().encode(GENERIC_SECRET),
      algorithm: "SHA-256",
      encoding: "base64",
      onEvent: (event) => ({ userId: event.userId }),
    });

    const request = new Request("https://example.com/webhooks/generic", {
      method: "POST",
      headers: {
        "x-webhook-signature": sig,
      },
      body: rawBody,
    });

    const response = await handler(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: "u_1" });
  });

  test("preserves unconsumed request stream inside onEvent so request.json() succeeds", async () => {
    const timestamp = 1700000000;
    const handler = createWebhookHandler({
      provider: "stripe",
      secret: STRIPE_SECRET,
      currentTimestamp: timestamp,
      onEvent: async (event, { request }) => {
        const clonedJson = (await request.json()) as { id: string };

        return { eventId: event.id, fromRequestJson: clonedJson.id };
      },
    });

    const request = await createStripeRequest(
      {
        id: "evt_unconsumed",
        object: "event",
        type: "payment_intent.succeeded",
        created: timestamp,
        data: { object: {} },
      },
      timestamp,
    );

    const response = await handler(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      eventId: "evt_unconsumed",
      fromRequestJson: "evt_unconsumed",
    });
  });

  test("returns 401 JSON error on invalid signature, missing header, or expired timestamp", async () => {
    const timestamp = 1700000000;
    const handler = createWebhookHandler({
      provider: "stripe",
      secret: STRIPE_SECRET,
      toleranceSeconds: 300,
      currentTimestamp: timestamp + 1000,
      onEvent: () => ({ ok: true }),
    });

    const expiredReq = await createStripeRequest(
      {
        id: "evt_expired",
        object: "event",
        type: "charge.succeeded",
        created: timestamp,
        data: { object: {} },
      },
      timestamp,
    );
    const expiredRes = await handler(expiredReq);

    expect(expiredRes.status).toBe(401);
    expect(await expiredRes.json()).toEqual({
      error: {
        code: "TIMESTAMP_TOLERANCE_EXCEEDED",
        message: expect.stringContaining("Timestamp outside tolerance window"),
      },
    });

    const badSigReq = await createStripeRequest(
      {
        id: "evt_bad_sig",
        object: "event",
        type: "charge.succeeded",
        created: timestamp + 1000,
        data: { object: {} },
      },
      timestamp + 1000,
      "wrong_secret",
    );
    const badSigRes = await handler(badSigReq);

    expect(badSigRes.status).toBe(401);
    expect(await badSigRes.json()).toEqual({
      error: {
        code: "SIGNATURE_VERIFICATION_FAILED",
        message: expect.any(String),
      },
    });

    const missingHeaderReq = new Request("https://example.com/webhooks", {
      method: "POST",
      body: '{"id":"evt_no_header"}',
    });
    const missingHeaderRes = await handler(missingHeaderReq);

    expect(missingHeaderRes.status).toBe(401);
    expect(await missingHeaderRes.json()).toEqual({
      error: {
        code: "INVALID_SIGNATURE_HEADER",
        message: expect.any(String),
      },
    });
  });

  test("returns 400 JSON error when request stream was already consumed or input is invalid", async () => {
    const handler = createWebhookHandler({
      provider: "github",
      secret: GITHUB_SECRET,
      onEvent: () => ({ ok: true }),
    });

    const request = await createGithubRequest({ action: "closed" });
    await request.text();

    const consumedRes = await handler(request);

    expect(consumedRes.status).toBe(400);
    expect(await consumedRes.json()).toEqual({
      error: {
        code: "PAYLOAD_EXTRACTION_FAILED",
        message: expect.stringContaining("Failed to read text from Request"),
      },
    });

    const invalidInputRes = await handler(null as unknown as Request);

    expect(invalidInputRes.status).toBe(400);
    expect(await invalidInputRes.json()).toEqual({
      error: {
        code: "PAYLOAD_EXTRACTION_FAILED",
        message: expect.stringContaining("Invalid webhook handler input"),
      },
    });

    const invalidContextRes = await handler({
      req: { raw: {} },
    } as unknown as Request);

    expect(invalidContextRes.status).toBe(400);
  });

  test("invokes custom onError callback with error, context, request, rawBody, and timestamp", async () => {
    let capturedError: unknown;
    let capturedRawBody: string | undefined;
    let capturedTimestamp: number | undefined;
    const timestamp = 1700000000;

    const handler = createWebhookHandler({
      provider: "stripe",
      secret: STRIPE_SECRET,
      currentTimestamp: timestamp,
      onEvent: () => ({ ok: true }),
      onError: (error, meta) => {
        capturedError = error;
        capturedRawBody = meta.rawBody;
        capturedTimestamp = meta.timestamp;

        return new Response(`Custom Error: ${error.code}`, { status: 403 });
      },
    });

    const badReq = await createStripeRequest(
      { id: "evt_bad" },
      timestamp,
      "wrong_secret",
    );

    const response = await handler(badReq);

    expect(response.status).toBe(403);
    expect(await response.text()).toBe(
      "Custom Error: SIGNATURE_VERIFICATION_FAILED",
    );
    expect(capturedError).toBeInstanceOf(SignatureVerificationError);
    expect(capturedRawBody).toBe('{"id":"evt_bad"}');
    expect(capturedTimestamp).toBe(timestamp);
  });

  test("propagates unhandled errors thrown inside onEvent or secret resolver", async () => {
    const handler = createWebhookHandler({
      provider: "github",
      secret: GITHUB_SECRET,
      onEvent: () => {
        throw new Error("Database connection lost");
      },
    });

    const request = await createGithubRequest({ action: "created" });

    await expect(handler(request)).rejects.toThrow("Database connection lost");

    const failingSecretHandler = createWebhookHandler({
      provider: "github",
      secret: () => {
        throw new Error("Vault unreachable");
      },
      onEvent: () => ({ ok: true }),
    });

    const request2 = await createGithubRequest({ action: "created" });

    await expect(failingSecretHandler(request2)).rejects.toThrow(
      "Vault unreachable",
    );
  });

  test("exports expected error classes for custom onError narrowing", () => {
    expect(new InvalidSignatureHeaderError()).toBeInstanceOf(Error);
    expect(new TimestampToleranceError(100, 300)).toBeInstanceOf(Error);
    expect(new PayloadExtractionError()).toBeInstanceOf(Error);
  });
});
