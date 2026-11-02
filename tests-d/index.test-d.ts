import { expectType, expectAssignable } from "tsd";
import {
  verifyWebhookSignature,
  assertWebhookSignature,
  computeSubtleHmac,
  timingSafeEqual,
  extractRawBody,
  type WebhookVerificationResult,
  type WebhookVerifyOptions,
  type RawBody,
  verifyStripeWebhook,
  assertStripeWebhook,
  parseStripeSignature,
  type StripeWebhookEvent,
  type StripeParsedSignatureHeader,
  type StripeVerifyOptions,
} from "../src/index.js";

interface SampleStripePayload {
  id: string;
  type: string;
  data: {
    object: {
      amount: number;
    };
  };
}

// 1. Verify generic payload type narrowing in verifyWebhookSignature
const result = await verifyWebhookSignature<SampleStripePayload>({
  body: '{"id":"evt_123","type":"charge.succeeded","data":{"object":{"amount":1000}}}',
  signature: "v1=sig",
  secret: "whsec_test",
});

expectType<WebhookVerificationResult<SampleStripePayload>>(result);
expectType<SampleStripePayload | undefined>(result.payload);
expectType<string>(result.rawBody);
expectType<boolean>(result.valid);

// 2. Verify assertWebhookSignature returns the narrowed payload directly
const payload = await assertWebhookSignature<SampleStripePayload>({
  body: '{"id":"evt_123"}',
  signature: "v1=sig",
  secret: "whsec_test",
});

expectType<SampleStripePayload>(payload);

// 3. Verify RawBody accepts supported edge/web representations
declare const strBody: string;
declare const bufferBody: Uint8Array;
declare const arrayBufferBody: ArrayBuffer;
declare const viewBody: DataView;
declare const streamBody: ReadableStream<Uint8Array>;
declare const requestBody: Request;

expectAssignable<RawBody>(strBody);
expectAssignable<RawBody>(bufferBody);
expectAssignable<RawBody>(arrayBufferBody);
expectAssignable<RawBody>(viewBody);
expectAssignable<RawBody>(streamBody);
expectAssignable<RawBody>(requestBody);

const extractedBody = await extractRawBody(requestBody);
expectType<string>(extractedBody);

// 4. Verify WebhookVerifyOptions structure
expectAssignable<WebhookVerifyOptions>({
  body: "test",
  signature: "sig",
  secret: "secret",
  toleranceSeconds: 300,
});

// 5. Verify computeSubtleHmac and timingSafeEqual types
const defaultHmac = await computeSubtleHmac("SHA-256", "secret", "data");
expectType<Uint8Array>(defaultHmac);

const hexHmac = await computeSubtleHmac("SHA-256", "secret", "data", "hex");
expectType<string>(hexHmac);

const base64Hmac = await computeSubtleHmac(
  "SHA-256",
  "secret",
  "data",
  "base64",
);
expectType<string>(base64Hmac);

const uint8Hmac = await computeSubtleHmac(
  "SHA-256",
  "secret",
  "data",
  "uint8array",
);
expectType<Uint8Array>(uint8Hmac);

const optionsHexHmac = await computeSubtleHmac("SHA-256", "secret", "data", {
  encoding: "hex",
});
expectType<string>(optionsHexHmac);

const isEqual = timingSafeEqual(new Uint8Array([1]), new Uint8Array([1]));
expectType<boolean>(isEqual);

// 6. Verify Stripe provider type inference and narrowing
const stripeResult = await verifyStripeWebhook({
  body: '{"id":"evt_stripe_123"}',
  signature: "t=1492774577,v1=sig",
  secret: "whsec_test",
});
expectType<WebhookVerificationResult<StripeWebhookEvent>>(stripeResult);
expectType<StripeWebhookEvent | undefined>(stripeResult.payload);

const customStripeResult = await verifyStripeWebhook<SampleStripePayload>({
  body: '{"id":"evt_123","type":"charge.succeeded","data":{"object":{"amount":1000}}}',
  signature: "t=1492774577,v1=sig",
  secret: "whsec_test",
});
expectType<WebhookVerificationResult<SampleStripePayload>>(customStripeResult);
expectType<SampleStripePayload | undefined>(customStripeResult.payload);

const assertedStripe = await assertStripeWebhook<SampleStripePayload>({
  body: '{"id":"evt_123"}',
  signature: "t=1492774577,v1=sig",
  secret: "whsec_test",
});
expectType<SampleStripePayload>(assertedStripe);

const parsedSig = parseStripeSignature("t=1492774577,v1=sig");
expectType<StripeParsedSignatureHeader>(parsedSig);

expectAssignable<StripeVerifyOptions>({
  body: "test",
  signature: "t=1,v1=sig",
  secret: "whsec_test",
  toleranceSeconds: 300,
});
