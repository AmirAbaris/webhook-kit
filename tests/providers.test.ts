import { describe, test } from "vitest";

describe("Stripe Provider", () => {
  test.todo("should parse Stripe-Signature t=...,v1=... format");
  test.todo("should verify valid Stripe webhook signature against raw payload");
  test.todo("should reject expired Stripe webhooks exceeding toleranceSeconds");
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
