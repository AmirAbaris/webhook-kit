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
import {
  assertGithubWebhook,
  githubPlugin,
  parseGithubSignature,
  verifyGithubWebhook,
  type GithubWebhookEvent,
} from "../src/providers/github.js";

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

/**
 * Helper to compute valid X-Hub-Signature-256 header value for tests.
 */
async function generateGithubHeader(
  secret: string,
  rawBody: string,
): Promise<string> {
  const sig = await computeSubtleHmac("SHA-256", secret, rawBody, "hex");

  return `sha256=${sig}`;
}

describe("GitHub Provider", () => {
  const secret = "github_webhook_secret_key_67890";
  const rawPayload = JSON.stringify({
    action: "opened",
    issue: {
      number: 42,
      title: "Bug report: verification error",
    },
    repository: {
      id: 12345678,
      name: "webhook-kit",
      full_name: "AmirAbaris/webhook-kit",
    },
    sender: {
      login: "octocat",
      id: 1,
    },
  });

  test("should parse X-Hub-Signature-256 sha256=... header", () => {
    // 1. Standard format
    const standardHeader =
      "sha256=d57c68d10b284e3d9e87179221a4c3f854e999760b92357771749219b1618e5b";
    const parsed = parseGithubSignature(standardHeader);

    expect(parsed).toBe(
      "d57c68d10b284e3d9e87179221a4c3f854e999760b92357771749219b1618e5b",
    );

    // 2. Extra whitespace around header and around signature
    const paddedHeader =
      "  sha256=  757107ea0eb2509fc211221cce984b8a37570b6d7586c22c30e411043c578f6a  ";
    const parsedPadded = parseGithubSignature(paddedHeader);

    expect(parsedPadded).toBe(
      "757107ea0eb2509fc211221cce984b8a37570b6d7586c22c30e411043c578f6a",
    );

    // 3. Uppercase SHA256= prefix
    const upperHeader =
      "SHA256=d57c68d10b284e3d9e87179221a4c3f854e999760b92357771749219b1618e5b";
    const parsedUpper = parseGithubSignature(upperHeader);

    expect(parsedUpper).toBe(
      "d57c68d10b284e3d9e87179221a4c3f854e999760b92357771749219b1618e5b",
    );

    // 4. Rejects missing or empty header
    expect(() => parseGithubSignature("")).toThrow(InvalidSignatureHeaderError);
    expect(() => parseGithubSignature("   ")).toThrow(
      InvalidSignatureHeaderError,
    );
    expect(() => parseGithubSignature(null as unknown as string)).toThrow(
      InvalidSignatureHeaderError,
    );

    // 5. Rejects header with missing or incorrect prefix (e.g. sha1= or bare hex)
    expect(() => parseGithubSignature("sha1=d57c68d10b284e3d")).toThrow(
      InvalidSignatureHeaderError,
    );
    expect(() =>
      parseGithubSignature(
        "d57c68d10b284e3d9e87179221a4c3f854e999760b92357771749219b1618e5b",
      ),
    ).toThrow(InvalidSignatureHeaderError);
    expect(() => parseGithubSignature("invalid_header")).toThrow(
      InvalidSignatureHeaderError,
    );

    // 6. Rejects header with empty signature after prefix
    expect(() => parseGithubSignature("sha256=")).toThrow(
      InvalidSignatureHeaderError,
    );
    expect(() => parseGithubSignature("sha256=   ")).toThrow(
      InvalidSignatureHeaderError,
    );
  });

  test("should verify valid GitHub webhook HMAC-SHA256", async () => {
    const validHeader = await generateGithubHeader(secret, rawPayload);

    // 1. Verify against raw string body
    const result = await verifyGithubWebhook<GithubWebhookEvent>({
      body: rawPayload,
      signature: validHeader,
      secret,
    });

    expect(result.valid).toBe(true);
    expect(result.rawBody).toBe(rawPayload);
    expect(result.error).toBeUndefined();
    expect(result.payload?.action).toBe("opened");
    expect(result.payload?.repository?.name).toBe("webhook-kit");
    expect(result.payload?.sender?.login).toBe("octocat");

    // 2. Verify against Web Standard Request object
    const request = new Request("https://api.example.com/webhooks/github", {
      method: "POST",
      headers: { "x-hub-signature-256": validHeader },
      body: rawPayload,
    });

    const requestResult = await verifyGithubWebhook({
      body: request,
      secret,
    });

    expect(requestResult.valid).toBe(true);
    expect(requestResult.rawBody).toBe(rawPayload);
    expect(requestResult.payload).toBeDefined();

    // 3. Verify with uppercase/canonical header name in headers record
    const headerResult = await verifyGithubWebhook({
      body: rawPayload,
      headers: { "X-Hub-Signature-256": validHeader },
      secret,
    });

    expect(headerResult.valid).toBe(true);

    // 4. Verify with Web Standard Headers instance
    const headersInstance = new Headers();
    headersInstance.set("x-hub-signature-256", validHeader);

    const headersResult = await verifyGithubWebhook({
      body: rawPayload,
      headers: headersInstance,
      secret,
    });

    expect(headersResult.valid).toBe(true);

    // 5. Verify case-insensitivity of hex signature comparison (e.g. uppercase hex in header)
    const upperHexSig = (
      await computeSubtleHmac("SHA-256", secret, rawPayload, "hex")
    ).toUpperCase();
    const upperSigHeader = `sha256=${upperHexSig}`;

    const upperSigResult = await verifyGithubWebhook({
      body: rawPayload,
      signature: upperSigHeader,
      secret,
    });

    expect(upperSigResult.valid).toBe(true);

    // 6. Verify assertGithubWebhook returns parsed payload directly
    const assertedPayload = await assertGithubWebhook({
      body: rawPayload,
      signature: validHeader,
      secret,
    });

    expect(assertedPayload.action).toBe("opened");
    expect(assertedPayload.repository?.name).toBe("webhook-kit");

    // 7. Verify parseJson: false keeps payload undefined
    const noParseResult = await verifyGithubWebhook({
      body: rawPayload,
      signature: validHeader,
      secret,
      parseJson: false,
    });

    expect(noParseResult.valid).toBe(true);
    expect(noParseResult.payload).toBeUndefined();

    // 8. Verify githubPlugin contract
    expect(githubPlugin.name).toBe("github");
    const pluginResult = await githubPlugin.verify({
      body: rawPayload,
      signature: validHeader,
      secret,
    });

    expect(pluginResult.valid).toBe(true);

    // 9. Verify with non-JSON raw body (e.g. plain text or urlencoded)
    const textBody = "payload=test_non_json_content";
    const textHeader = await generateGithubHeader(secret, textBody);
    const textResult = await verifyGithubWebhook({
      body: textBody,
      signature: textHeader,
      secret,
    });

    expect(textResult.valid).toBe(true);
    expect(textResult.rawBody).toBe(textBody);
    expect(textResult.payload).toBeUndefined();
  });

  test("should reject tampered GitHub payloads", async () => {
    const validHeader = await generateGithubHeader(secret, rawPayload);

    // 1. Tampered payload
    const tamperedPayload = JSON.stringify({
      action: "opened",
      issue: {
        number: 42,
        title: "Malicious injection attempt",
      },
    });

    const tamperedResult = await verifyGithubWebhook({
      body: tamperedPayload,
      signature: validHeader,
      secret,
    });

    expect(tamperedResult.valid).toBe(false);
    expect(tamperedResult.error).toBeInstanceOf(SignatureVerificationError);
    expect(tamperedResult.error?.code).toBe("SIGNATURE_VERIFICATION_FAILED");

    await expect(
      assertGithubWebhook({
        body: tamperedPayload,
        signature: validHeader,
        secret,
      }),
    ).rejects.toThrow(SignatureVerificationError);

    // 2. Mismatched signing secret
    const wrongSecretResult = await verifyGithubWebhook({
      body: rawPayload,
      signature: validHeader,
      secret: "wrong_secret_key_12345",
    });

    expect(wrongSecretResult.valid).toBe(false);
    expect(wrongSecretResult.error).toBeInstanceOf(SignatureVerificationError);

    // 3. Missing secret
    const missingSecretResult = await verifyGithubWebhook({
      body: rawPayload,
      signature: validHeader,
      secret: "",
    });

    expect(missingSecretResult.valid).toBe(false);
    expect(missingSecretResult.error).toBeInstanceOf(
      SignatureVerificationError,
    );

    // 4. Missing signature header
    const missingHeaderResult = await verifyGithubWebhook({
      body: rawPayload,
      secret,
    });

    expect(missingHeaderResult.valid).toBe(false);
    expect(missingHeaderResult.error).toBeInstanceOf(
      InvalidSignatureHeaderError,
    );

    // 5. Malformed signature header (e.g. invalid prefix)
    const malformedHeaderResult = await verifyGithubWebhook({
      body: rawPayload,
      signature: "sha1=not_a_valid_sha256_header",
      secret,
    });

    expect(malformedHeaderResult.valid).toBe(false);
    expect(malformedHeaderResult.error).toBeInstanceOf(
      InvalidSignatureHeaderError,
    );

    // 6. throwOnError: true throws errors directly
    await expect(
      verifyGithubWebhook({
        body: tamperedPayload,
        signature: validHeader,
        secret,
        throwOnError: true,
      }),
    ).rejects.toThrow(SignatureVerificationError);

    await expect(
      verifyGithubWebhook({
        body: rawPayload,
        secret,
        throwOnError: true,
      }),
    ).rejects.toThrow(InvalidSignatureHeaderError);
  });
});

describe("Shopify Provider", () => {
  test.todo("should decode Base64 X-Shopify-Hmac-Sha256 signature header");
  test.todo("should verify valid Shopify webhook HMAC");
});
