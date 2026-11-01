import { describe, test } from "vitest";

describe("verifyWebhookSignature", () => {
  test.todo(
    "should verify valid HMAC-SHA256 signature against raw text string",
  );
  test.todo(
    "should verify signature directly from Web Standard Request object",
  );
  test.todo(
    "should reject invalid or tampered payload signatures in constant time",
  );
  test.todo("should reject signatures with mismatched secret keys");
  test.todo(
    "should enforce timestamp tolerance window and reject replayed webhooks",
  );
  test.todo("should safely parse JSON payload when signature is valid");
  test.todo(
    "should leave rawBody intact without altering formatting or whitespace",
  );
});

describe("assertWebhookSignature", () => {
  test.todo("should return typed payload on successful verification");
  test.todo(
    "should throw SignatureVerificationError when signature is invalid",
  );
  test.todo("should throw TimestampToleranceError when timestamp is expired");
});
