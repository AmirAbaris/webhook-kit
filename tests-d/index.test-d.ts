import { expectType, expectAssignable } from "tsd";
import {
  verifyWebhookSignature,
  assertWebhookSignature,
  computeSubtleHmac,
  timingSafeEqual,
  type WebhookVerificationResult,
  type WebhookVerifyOptions,
  type RawBody,
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
declare const requestBody: Request;

expectAssignable<RawBody>(strBody);
expectAssignable<RawBody>(bufferBody);
expectAssignable<RawBody>(requestBody);

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
