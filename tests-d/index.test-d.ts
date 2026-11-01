import { expectType, expectAssignable } from "tsd";
import {
  verifyWebhookSignature,
  assertWebhookSignature,
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
