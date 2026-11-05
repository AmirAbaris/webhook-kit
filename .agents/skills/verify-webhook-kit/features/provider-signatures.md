# Feature: Provider Adapters & Signature Formats

## Sub-features
- First-party provider adapters for Stripe, GitHub, and Shopify.
- Stripe signature parsing (`t=...,v1=...`) with timestamp extraction and lowercase hex normalization.
- Stripe candidate signature list evaluation via constant-time comparison.
- Timestamp tolerance validation rejecting non-finite (`NaN`, `Infinity`, `-Infinity`) or negative timestamps and tolerances.
- Fractional timestamp handling with safe flooring.
- GitHub signature parsing (`sha256=...`) with strict 64-character hexadecimal format validation (`^[0-9a-fA-F]{64}$`).
- Automatic extraction of `x-github-delivery` header.
- Shopify signature parsing (`X-Shopify-Hmac-Sha256`) with strict 44-character Base64 format validation (`^[A-Za-z0-9+/]{43}=$`).
- Automatic extraction of `x-shopify-webhook-id` header supporting string and numeric identifiers.
- Case-insensitive header lookup across `Headers` instances and plain record objects.
- Declarative universal route handler (`createWebhookHandler`) for Next.js App Router, Hono, and WinterCG runtimes.

## How to get to it (user POV)
Developers pass `{ provider: "stripe" | "github" | "shopify" }` to `verifyWebhookSignature`, `assertWebhookSignature`, or `createWebhookHandler`. The library validates provider-specific headers and dispatches typed event payloads.

## Driving it with Provider Verification
Run this command to verify provider signature formatting, timestamp tolerance enforcement, and format validation:
```bash
node -e '
import {
  parseStripeSignature,
  validateTimestampTolerance,
  TimestampToleranceError,
  parseGithubSignature,
  InvalidSignatureHeaderError,
  parseShopifySignature,
} from "./dist/index.mjs";

async function verifyProviderSignatures() {
  // 1. Stripe timestamp validation with finite bounds
  const now = Math.floor(Date.now() / 1000);
  validateTimestampTolerance(now - 10, 300, now);

  let caughtExpired = false;
  try {
    validateTimestampTolerance(now - 400, 300, now);
  } catch (err) {
    if (err instanceof TimestampToleranceError) caughtExpired = true;
  }
  if (!caughtExpired) throw new Error("validateTimestampTolerance did not reject expired timestamp.");

  let caughtNaN = false;
  try {
    validateTimestampTolerance(NaN, 300, now);
  } catch (err) {
    if (err instanceof TimestampToleranceError) caughtNaN = true;
  }
  if (!caughtNaN) throw new Error("validateTimestampTolerance did not reject NaN timestamp.");

  // 2. GitHub strict 64-character hex format validation
  const validHexSig = "a".repeat(64);
  const parsedGithub = parseGithubSignature(`sha256=${validHexSig}`);
  if (parsedGithub !== validHexSig) throw new Error("parseGithubSignature failed on valid 64-char hex.");

  let caughtInvalidGithub = false;
  try {
    parseGithubSignature("sha256=too_short");
  } catch (err) {
    if (err instanceof InvalidSignatureHeaderError) caughtInvalidGithub = true;
  }
  if (!caughtInvalidGithub) throw new Error("parseGithubSignature accepted short signature.");

  // 3. Shopify strict 44-character Base64 format validation
  const validShopifySig = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const parsedShopify = parseShopifySignature(validShopifySig);
  if (parsedShopify !== validShopifySig) throw new Error("parseShopifySignature failed on valid 44-char Base64.");

  let caughtInvalidShopify = false;
  try {
    parseShopifySignature("not-base64-and-wrong-len");
  } catch (err) {
    if (err instanceof InvalidSignatureHeaderError) caughtInvalidShopify = true;
  }
  if (!caughtInvalidShopify) throw new Error("parseShopifySignature accepted invalid Base64 signature.");

  console.log("✓ Provider adapters and signature formats verified successfully.");
}

verifyProviderSignatures();
'
```

## Gotchas
- GitHub signatures require the `sha256=` prefix followed by exactly 64 hex characters.
- Shopify signatures require exactly 44 Base64 characters representing a 32-byte SHA-256 digest.
- Setting `toleranceSeconds <= 0` explicitly disables replay timestamp checks.
- Passing non-finite numbers (`NaN`, `Infinity`) for timestamp or tolerance immediately throws `TimestampToleranceError`.
