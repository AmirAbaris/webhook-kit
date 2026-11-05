import { describe, expect, test } from "vitest";
import {
  assertWebhookSignature,
  computeSubtleHmac,
  InvalidSignatureHeaderError,
  PROVIDER_REGISTRY,
  SignatureVerificationError,
  TimestampToleranceError,
  type WebhookProviderPlugin,
  type WebhookVerifyOptions,
  verifyWebhookSignature,
  WebhookKitError,
} from "../src/index.js";

const TEST_SECRET = "whsec_generic_test_secret_123456";
const RAW_JSON_BODY =
  '{"id":"evt_generic_01","type":"order.completed","data":{"total":4999}}';

describe("verifyWebhookSignature", () => {
  test("should verify valid HMAC-SHA256 signature against raw text string", async () => {
    const sig = await computeSubtleHmac(
      "SHA-256",
      TEST_SECRET,
      RAW_JSON_BODY,
      "hex",
    );

    const result = await verifyWebhookSignature({
      body: RAW_JSON_BODY,
      signature: sig,
      secret: TEST_SECRET,
    });

    expect(result.valid).toBe(true);
    expect(result.rawBody).toBe(RAW_JSON_BODY);
    expect(result.error).toBeUndefined();

    const prefixedResult = await verifyWebhookSignature({
      body: RAW_JSON_BODY,
      signature: `sha256=${sig.toUpperCase()}`,
      secret: TEST_SECRET,
    });

    expect(prefixedResult.valid).toBe(true);

    const b64Sig = await computeSubtleHmac(
      "SHA-256",
      TEST_SECRET,
      RAW_JSON_BODY,
      "base64",
    );
    const b64Result = await verifyWebhookSignature({
      body: RAW_JSON_BODY,
      signature: b64Sig,
      secret: TEST_SECRET,
      encoding: "base64",
    });

    expect(b64Result.valid).toBe(true);
  });

  test("should verify signature directly from Web Standard Request object", async () => {
    const sig = await computeSubtleHmac(
      "SHA-256",
      TEST_SECRET,
      RAW_JSON_BODY,
      "hex",
    );
    const request = new Request("https://example.com/webhooks/generic", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": `sha256=${sig}`,
      },
      body: RAW_JSON_BODY,
    });

    const result = await verifyWebhookSignature({
      body: request,
      secret: TEST_SECRET,
    });

    expect(result.valid).toBe(true);
    expect(result.rawBody).toBe(RAW_JSON_BODY);
    expect(result.payload).toEqual({
      id: "evt_generic_01",
      type: "order.completed",
      data: { total: 4999 },
    });
  });

  test("should reject invalid or tampered payload signatures in constant time", async () => {
    const sig = await computeSubtleHmac(
      "SHA-256",
      TEST_SECRET,
      RAW_JSON_BODY,
      "hex",
    );
    const tamperedBody =
      '{"id":"evt_generic_01","type":"order.completed","data":{"total":1}}';

    const result = await verifyWebhookSignature({
      body: tamperedBody,
      signature: sig,
      secret: TEST_SECRET,
    });

    expect(result.valid).toBe(false);
    expect(result.rawBody).toBe(tamperedBody);
    expect(result.payload).toBeUndefined();
    expect(result.error).toBeInstanceOf(SignatureVerificationError);
  });

  test("should reject signatures with mismatched secret keys", async () => {
    const sig = await computeSubtleHmac(
      "SHA-256",
      TEST_SECRET,
      RAW_JSON_BODY,
      "hex",
    );

    const wrongSecretResult = await verifyWebhookSignature({
      body: RAW_JSON_BODY,
      signature: sig,
      secret: "whsec_wrong_secret_key",
    });

    expect(wrongSecretResult.valid).toBe(false);
    expect(wrongSecretResult.error).toBeInstanceOf(SignatureVerificationError);

    const emptySecretResult = await verifyWebhookSignature({
      body: RAW_JSON_BODY,
      signature: sig,
      secret: "",
    });

    expect(emptySecretResult.valid).toBe(false);
    expect(emptySecretResult.error).toBeInstanceOf(SignatureVerificationError);
  });

  test("should enforce timestamp tolerance window and reject replayed webhooks", async () => {
    const now = 1710000000;
    const validTs = now - 120;
    const expiredTs = now - 600;

    const timestampedSig = await computeSubtleHmac(
      "SHA-256",
      TEST_SECRET,
      `${validTs}.${RAW_JSON_BODY}`,
      "hex",
    );

    const validResult = await verifyWebhookSignature({
      body: RAW_JSON_BODY,
      signature: timestampedSig,
      secret: TEST_SECRET,
      timestamp: validTs,
      toleranceSeconds: 300,
      currentTimestamp: now,
    });

    expect(validResult.valid).toBe(true);
    expect(validResult.timestamp).toBe(validTs);

    const expiredSig = await computeSubtleHmac(
      "SHA-256",
      TEST_SECRET,
      `${expiredTs}.${RAW_JSON_BODY}`,
      "hex",
    );

    const expiredResult = await verifyWebhookSignature({
      body: RAW_JSON_BODY,
      signature: expiredSig,
      secret: TEST_SECRET,
      headers: { "x-webhook-timestamp": String(expiredTs) },
      toleranceSeconds: 300,
      currentTimestamp: now,
    });

    expect(expiredResult.valid).toBe(false);
    expect(expiredResult.error).toBeInstanceOf(TimestampToleranceError);

    // Handles floating point timestamps gracefully with Math.floor
    const floatTs = now - 50.789;
    const floatSig = await computeSubtleHmac(
      "SHA-256",
      TEST_SECRET,
      `${Math.floor(floatTs)}.${RAW_JSON_BODY}`,
      "hex",
    );
    const floatResult = await verifyWebhookSignature({
      body: RAW_JSON_BODY,
      signature: floatSig,
      secret: TEST_SECRET,
      timestamp: floatTs,
      toleranceSeconds: 300,
      currentTimestamp: now,
    });
    expect(floatResult.valid).toBe(true);
    expect(floatResult.timestamp).toBe(Math.floor(floatTs));
  });

  test("should safely parse JSON payload when signature is valid", async () => {
    interface OrderPayload {
      id: string;
      type: string;
      data: { total: number };
    }

    const sig = await computeSubtleHmac(
      "SHA-256",
      TEST_SECRET,
      RAW_JSON_BODY,
      "hex",
    );

    const result = await verifyWebhookSignature<OrderPayload>({
      body: RAW_JSON_BODY,
      signature: sig,
      secret: TEST_SECRET,
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.id).toBe("evt_generic_01");
      expect(result.payload.data.total).toBe(4999);
    }

    const unparsedResult = await verifyWebhookSignature<OrderPayload>({
      body: RAW_JSON_BODY,
      signature: sig,
      secret: TEST_SECRET,
      parseJson: false,
    });

    expect(unparsedResult.valid).toBe(true);
    expect(unparsedResult.payload).toBeUndefined();
  });

  test("should leave rawBody intact without altering formatting or whitespace", async () => {
    const formattedBody =
      '{\n  "id": "evt_whitespace",\n  "nested": { "a": 1,  "b": 2 }\r\n}';
    const sig = await computeSubtleHmac(
      "SHA-256",
      TEST_SECRET,
      formattedBody,
      "hex",
    );

    const result = await verifyWebhookSignature({
      body: new TextEncoder().encode(formattedBody),
      signature: sig,
      secret: TEST_SECRET,
    });

    expect(result.valid).toBe(true);
    expect(result.rawBody).toBe(formattedBody);
  });

  test("should delegate verification to built-in stripe, github, and shopify providers", async () => {
    expect(PROVIDER_REGISTRY.stripe.name).toBe("stripe");
    expect(PROVIDER_REGISTRY.github.name).toBe("github");
    expect(PROVIDER_REGISTRY.shopify.name).toBe("shopify");

    const ts = Math.floor(Date.now() / 1000);
    const stripeSig = await computeSubtleHmac(
      "SHA-256",
      TEST_SECRET,
      `${ts}.${RAW_JSON_BODY}`,
      "hex",
    );
    const stripeRes = await verifyWebhookSignature({
      provider: "stripe",
      body: RAW_JSON_BODY,
      signature: `t=${ts},v1=${stripeSig}`,
      secret: TEST_SECRET,
    });

    expect(stripeRes.valid).toBe(true);
    expect(stripeRes.timestamp).toBe(ts);

    const githubSig = await computeSubtleHmac(
      "SHA-256",
      TEST_SECRET,
      RAW_JSON_BODY,
      "hex",
    );
    const githubRes = await verifyWebhookSignature({
      provider: "github",
      body: RAW_JSON_BODY,
      headers: { "X-Hub-Signature-256": `sha256=${githubSig}` },
      secret: TEST_SECRET,
    });

    expect(githubRes.valid).toBe(true);

    const shopifySig = await computeSubtleHmac(
      "SHA-256",
      TEST_SECRET,
      RAW_JSON_BODY,
      "base64",
    );
    const shopifyRes = await verifyWebhookSignature({
      provider: "shopify",
      body: RAW_JSON_BODY,
      headers: { "X-Shopify-Hmac-Sha256": shopifySig },
      secret: TEST_SECRET,
    });

    expect(shopifyRes.valid).toBe(true);
  });

  test("should delegate verification to a custom WebhookProviderPlugin or reject unsupported provider names", async () => {
    interface CustomPayload {
      customId: string;
    }

    const customPlugin: WebhookProviderPlugin<
      CustomPayload,
      WebhookVerifyOptions
    > = {
      name: "custom-provider",
      async verify(opts) {
        if (opts.signature !== "custom-valid-sig") {
          return {
            valid: false,
            rawBody: String(opts.body),
            error: new SignatureVerificationError("Custom provider rejected"),
          };
        }

        return {
          valid: true,
          rawBody: String(opts.body),
          payload: { customId: "custom_123" },
        };
      },
    };

    const customSuccess = await verifyWebhookSignature({
      provider: customPlugin,
      body: '{"customId":"custom_123"}',
      signature: "custom-valid-sig",
      secret: TEST_SECRET,
    });

    expect(customSuccess.valid).toBe(true);
    if (customSuccess.valid) {
      expect(customSuccess.payload.customId).toBe("custom_123");
    }

    const unsupportedRes = await verifyWebhookSignature({
      provider: "unknown-provider" as "stripe",
      body: RAW_JSON_BODY,
      signature: "sig",
      secret: TEST_SECRET,
    });

    expect(unsupportedRes.valid).toBe(false);
    if (!unsupportedRes.valid) {
      expect(unsupportedRes.error).toBeInstanceOf(WebhookKitError);
      expect(unsupportedRes.error.code).toBe("UNSUPPORTED_PROVIDER");
    }
  });
});

describe("assertWebhookSignature", () => {
  test("should return typed payload on successful verification", async () => {
    interface OrderPayload {
      id: string;
      type: string;
      data: { total: number };
    }

    const sig = await computeSubtleHmac(
      "SHA-256",
      TEST_SECRET,
      RAW_JSON_BODY,
      "hex",
    );

    const payload = await assertWebhookSignature<OrderPayload>({
      body: RAW_JSON_BODY,
      signature: sig,
      secret: TEST_SECRET,
    });

    expect(payload).toEqual({
      id: "evt_generic_01",
      type: "order.completed",
      data: { total: 4999 },
    });

    const githubPayload = await assertWebhookSignature<OrderPayload>({
      provider: "github",
      body: RAW_JSON_BODY,
      signature: `sha256=${sig}`,
      secret: TEST_SECRET,
    });

    expect(githubPayload.id).toBe("evt_generic_01");
  });

  test("should throw SignatureVerificationError when signature is invalid", async () => {
    await expect(
      assertWebhookSignature({
        body: RAW_JSON_BODY,
        signature: "deadbeef",
        secret: TEST_SECRET,
      }),
    ).rejects.toThrow(SignatureVerificationError);

    await expect(
      assertWebhookSignature({
        provider: "github",
        body: RAW_JSON_BODY,
        signature: "invalid-prefix",
        secret: TEST_SECRET,
      }),
    ).rejects.toThrow(InvalidSignatureHeaderError);
  });

  test("should throw TimestampToleranceError when timestamp is expired", async () => {
    const now = 1710000000;
    const expiredTs = now - 1000;
    const sig = await computeSubtleHmac(
      "SHA-256",
      TEST_SECRET,
      `${expiredTs}.${RAW_JSON_BODY}`,
      "hex",
    );

    await expect(
      assertWebhookSignature({
        body: RAW_JSON_BODY,
        signature: sig,
        secret: TEST_SECRET,
        timestamp: expiredTs,
        toleranceSeconds: 300,
        currentTimestamp: now,
      }),
    ).rejects.toThrow(TimestampToleranceError);
  });
});
