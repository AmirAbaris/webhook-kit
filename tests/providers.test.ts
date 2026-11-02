import { describe, expect, test } from "vitest";
import { computeSubtleHmac } from "../src/crypto/subtle.js";
import {
  InvalidSignatureHeaderError,
  SignatureVerificationError,
  TimestampToleranceError,
} from "../src/errors.js";
import {
  assertStripeWebhook,
  parseStripeSignature,
  stripePlugin,
  validateTimestampTolerance,
  verifyStripeWebhook,
  type StripeWebhookEvent,
} from "../src/providers/stripe.js";

/**
 * Helper to compute valid Stripe-Signature header value for tests.
 */
async function generateStripeHeader(
  secret: string,
  rawBody: string,
  timestamp: number,
  additionalSignatures: string[] = [],
): Promise<string> {
  const signedPayload = `${timestamp}.${rawBody}`;
  const sig = await computeSubtleHmac("SHA-256", secret, signedPayload, "hex");
  const sigTags = [sig, ...additionalSignatures]
    .map((s) => `v1=${s}`)
    .join(",");

  return `t=${timestamp},${sigTags}`;
}

describe("Stripe Provider", () => {
  const secret = "whsec_test_secret_key_12345";
  const rawPayload = JSON.stringify({
    id: "evt_test_webhook_001",
    object: "event",
    type: "payment_intent.succeeded",
    created: 1710000000,
    data: {
      object: {
        id: "pi_123456789",
        amount: 2500,
        currency: "usd",
      },
    },
  });

  test("should parse Stripe-Signature t=...,v1=... format", () => {
    // 1. Standard Stripe-Signature header
    const standardHeader =
      "t=1492774577,v1=5257a869e7ecebeda32affa62cd49238b600f6450772f33857e40e814cc01b95";
    const parsed = parseStripeSignature(standardHeader);

    expect(parsed.timestamp).toBe(1492774577);
    expect(parsed.signatures).toEqual([
      "5257a869e7ecebeda32affa62cd49238b600f6450772f33857e40e814cc01b95",
    ]);
    expect(parsed.v0Signatures).toBeUndefined();

    // 2. Multiple v1 signatures (key rollover) with spaces
    const multiHeader =
      "t=1600000000, v1=sig_one_abcdef, v1=sig_two_123456, v0=legacy_sig";
    const parsedMulti = parseStripeSignature(multiHeader);

    expect(parsedMulti.timestamp).toBe(1600000000);
    expect(parsedMulti.signatures).toEqual([
      "sig_one_abcdef",
      "sig_two_123456",
    ]);
    expect(parsedMulti.v0Signatures).toEqual(["legacy_sig"]);

    // 3. Rejects missing or empty header
    expect(() => parseStripeSignature("")).toThrow(InvalidSignatureHeaderError);
    expect(() => parseStripeSignature("   ")).toThrow(
      InvalidSignatureHeaderError,
    );
    expect(() => parseStripeSignature(null as unknown as string)).toThrow(
      InvalidSignatureHeaderError,
    );

    // 4. Rejects header without timestamp (t=)
    expect(() => parseStripeSignature("v1=some_signature")).toThrow(
      InvalidSignatureHeaderError,
    );
    expect(() => parseStripeSignature("t=not_a_number,v1=sig")).toThrow(
      InvalidSignatureHeaderError,
    );
    expect(() => parseStripeSignature("t=-10,v1=sig")).toThrow(
      InvalidSignatureHeaderError,
    );

    // 5. Rejects header without v1 signature
    expect(() => parseStripeSignature("t=1492774577,v0=legacy_only")).toThrow(
      InvalidSignatureHeaderError,
    );
    expect(() => parseStripeSignature("t=1492774577,v1=")).toThrow(
      InvalidSignatureHeaderError,
    );
  });

  test("should verify valid Stripe webhook signature against raw payload", async () => {
    const now = Math.floor(Date.now() / 1000);
    const validHeader = await generateStripeHeader(secret, rawPayload, now);

    // 1. Verify against raw string body
    const result = await verifyStripeWebhook<StripeWebhookEvent>({
      body: rawPayload,
      signature: validHeader,
      secret,
    });

    expect(result.valid).toBe(true);
    expect(result.rawBody).toBe(rawPayload);
    expect(result.timestamp).toBe(now);
    expect(result.error).toBeUndefined();
    expect(result.payload?.id).toBe("evt_test_webhook_001");
    expect(result.payload?.type).toBe("payment_intent.succeeded");

    // 2. Verify against Web Standard Request object
    const request = new Request("https://api.example.com/webhooks/stripe", {
      method: "POST",
      headers: { "Stripe-Signature": validHeader },
      body: rawPayload,
    });

    const requestResult = await verifyStripeWebhook({
      body: request,
      secret,
    });

    expect(requestResult.valid).toBe(true);
    expect(requestResult.rawBody).toBe(rawPayload);
    expect(requestResult.payload).toBeDefined();

    // 3. Verify with lowercase header in headers record
    const headerResult = await verifyStripeWebhook({
      body: rawPayload,
      headers: { "stripe-signature": validHeader },
      secret,
    });

    expect(headerResult.valid).toBe(true);

    // 4. Verify with Web Standard Headers instance
    const headersInstance = new Headers();
    headersInstance.set("stripe-signature", validHeader);

    const headersResult = await verifyStripeWebhook({
      body: rawPayload,
      headers: headersInstance,
      secret,
    });

    expect(headersResult.valid).toBe(true);

    // 5. Verify multiple v1 signatures where first is old and second matches
    const rolledHeader = `t=${now},v1=old_rolled_signature_hash,v1=${await computeSubtleHmac("SHA-256", secret, `${now}.${rawPayload}`, "hex")}`;
    const rolledResult = await verifyStripeWebhook({
      body: rawPayload,
      signature: rolledHeader,
      secret,
    });

    expect(rolledResult.valid).toBe(true);

    // 6. Verify assertStripeWebhook returns parsed payload directly
    const assertedPayload = await assertStripeWebhook({
      body: rawPayload,
      signature: validHeader,
      secret,
    });

    expect(assertedPayload.id).toBe("evt_test_webhook_001");

    // 7. Verify parseJson: false keeps payload undefined
    const noParseResult = await verifyStripeWebhook({
      body: rawPayload,
      signature: validHeader,
      secret,
      parseJson: false,
    });

    expect(noParseResult.valid).toBe(true);
    expect(noParseResult.payload).toBeUndefined();

    // 8. Verify stripePlugin contract
    expect(stripePlugin.name).toBe("stripe");
    const pluginResult = await stripePlugin.verify({
      body: rawPayload,
      signature: validHeader,
      secret,
    });

    expect(pluginResult.valid).toBe(true);
  });

  test("should reject expired Stripe webhooks exceeding toleranceSeconds", async () => {
    const fixedNow = 1700001000;
    const expiredTimestamp = fixedNow - 301; // 301s ago (> default 300s)
    const expiredHeader = await generateStripeHeader(
      secret,
      rawPayload,
      expiredTimestamp,
    );

    // 1. Returns valid: false and TimestampToleranceError in result
    const result = await verifyStripeWebhook({
      body: rawPayload,
      signature: expiredHeader,
      secret,
      currentTimestamp: fixedNow,
    });

    expect(result.valid).toBe(false);
    expect(result.timestamp).toBe(expiredTimestamp);
    expect(result.error).toBeInstanceOf(TimestampToleranceError);
    expect((result.error as TimestampToleranceError).code).toBe(
      "TIMESTAMP_TOLERANCE_EXCEEDED",
    );
    expect((result.error as TimestampToleranceError).timestamp).toBe(
      expiredTimestamp,
    );
    expect((result.error as TimestampToleranceError).toleranceSeconds).toBe(
      300,
    );

    // 2. assertStripeWebhook throws TimestampToleranceError
    await expect(
      assertStripeWebhook({
        body: rawPayload,
        signature: expiredHeader,
        secret,
        currentTimestamp: fixedNow,
      }),
    ).rejects.toThrow(TimestampToleranceError);

    // 3. verifyStripeWebhook with throwOnError: true throws
    await expect(
      verifyStripeWebhook({
        body: rawPayload,
        signature: expiredHeader,
        secret,
        currentTimestamp: fixedNow,
        throwOnError: true,
      }),
    ).rejects.toThrow(TimestampToleranceError);

    // 4. Future timestamp exceeding tolerance is also rejected
    const futureTimestamp = fixedNow + 305;
    const futureHeader = await generateStripeHeader(
      secret,
      rawPayload,
      futureTimestamp,
    );

    const futureResult = await verifyStripeWebhook({
      body: rawPayload,
      signature: futureHeader,
      secret,
      currentTimestamp: fixedNow,
    });

    expect(futureResult.valid).toBe(false);
    expect(futureResult.error).toBeInstanceOf(TimestampToleranceError);

    // 5. Custom tolerance window accepts webhook within custom window
    const customResult = await verifyStripeWebhook({
      body: rawPayload,
      signature: expiredHeader,
      secret,
      toleranceSeconds: 600,
      currentTimestamp: fixedNow,
    });

    expect(customResult.valid).toBe(true);

    // 6. Tolerance 0 disables replay protection
    const ancientTimestamp = fixedNow - 86400 * 30; // 30 days old
    const ancientHeader = await generateStripeHeader(
      secret,
      rawPayload,
      ancientTimestamp,
    );

    const disabledToleranceResult = await verifyStripeWebhook({
      body: rawPayload,
      signature: ancientHeader,
      secret,
      toleranceSeconds: 0,
      currentTimestamp: fixedNow,
    });

    expect(disabledToleranceResult.valid).toBe(true);

    // 7. validateTimestampTolerance direct function check
    expect(() =>
      validateTimestampTolerance(expiredTimestamp, 300, fixedNow),
    ).toThrow(TimestampToleranceError);
    expect(() =>
      validateTimestampTolerance(fixedNow - 300, 300, fixedNow),
    ).not.toThrow();
  });

  test("should reject tampered Stripe webhook payloads and invalid secrets", async () => {
    const now = Math.floor(Date.now() / 1000);
    const validHeader = await generateStripeHeader(secret, rawPayload, now);

    // 1. Tampered payload
    const tamperedPayload = '{"id":"evt_test_webhook_001","amount":9999999}';
    const tamperedResult = await verifyStripeWebhook({
      body: tamperedPayload,
      signature: validHeader,
      secret,
    });

    expect(tamperedResult.valid).toBe(false);
    expect(tamperedResult.error).toBeInstanceOf(SignatureVerificationError);
    expect(tamperedResult.error?.code).toBe("SIGNATURE_VERIFICATION_FAILED");

    await expect(
      assertStripeWebhook({
        body: tamperedPayload,
        signature: validHeader,
        secret,
      }),
    ).rejects.toThrow(SignatureVerificationError);

    // 2. Mismatched signing secret
    const wrongSecretResult = await verifyStripeWebhook({
      body: rawPayload,
      signature: validHeader,
      secret: "whsec_wrong_key_xyz",
    });

    expect(wrongSecretResult.valid).toBe(false);
    expect(wrongSecretResult.error).toBeInstanceOf(SignatureVerificationError);

    // 3. Missing secret
    const missingSecretResult = await verifyStripeWebhook({
      body: rawPayload,
      signature: validHeader,
      secret: "",
    });

    expect(missingSecretResult.valid).toBe(false);
    expect(missingSecretResult.error).toBeInstanceOf(
      SignatureVerificationError,
    );

    // 4. Missing signature header
    const missingHeaderResult = await verifyStripeWebhook({
      body: rawPayload,
      secret,
    });

    expect(missingHeaderResult.valid).toBe(false);
    expect(missingHeaderResult.error).toBeInstanceOf(
      InvalidSignatureHeaderError,
    );
  });
});

describe("GitHub Provider", () => {
  test.todo("should parse X-Hub-Signature-256 sha256=... header");
  test.todo("should verify valid GitHub webhook HMAC-SHA256");
  test.todo("should reject tampered GitHub payloads");
});

describe("Shopify Provider", () => {
  test.todo("should decode Base64 X-Shopify-Hmac-Sha256 signature header");
  test.todo("should verify valid Shopify webhook HMAC");
});
