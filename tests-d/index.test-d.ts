import { expectType, expectAssignable } from "tsd";
import {
  verifyWebhookSignature,
  assertWebhookSignature,
  computeSubtleHmac,
  timingSafeEqual,
  extractRawBody,
  WebhookKitError,
  type WebhookProviderPlugin,
  type WebhookVerificationResult,
  type WebhookVerifyOptions,
  type RawBody,
  verifyStripeWebhook,
  assertStripeWebhook,
  parseStripeSignature,
  type StripeWebhookEvent,
  type StripeParsedSignatureHeader,
  type StripeVerifyOptions,
  verifyGithubWebhook,
  assertGithubWebhook,
  parseGithubSignature,
  type GithubWebhookEvent,
  type GithubVerifyOptions,
  verifyShopifyWebhook,
  assertShopifyWebhook,
  parseShopifySignature,
  type ShopifyWebhookEvent,
  type ShopifyVerifyOptions,
  CryptoKeyLruCache,
  getCachedCryptoKey,
  clearCryptoKeyCache,
  getCryptoKeyCacheSize,
  createWebhookHandler,
  type UniversalWebhookHandler,
  type WebhookLikeContext,
  type WebhookEventMeta,
  type WebhookErrorMeta,
  InMemoryReplayStore,
  createInMemoryReplayStore,
  ReplayAttackError,
  type WebhookReplayStore,
  type InMemoryReplayStoreOptions,
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

if (result.valid) {
  expectType<true>(result.valid);
  expectType<SampleStripePayload>(result.payload);
  expectType<undefined>(result.error);
} else {
  expectType<false>(result.valid);
  expectType<undefined>(result.payload);
  expectType<WebhookKitError>(result.error);
}

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

// 7. Verify GitHub provider type inference and narrowing
const githubResult = await verifyGithubWebhook({
  body: '{"action":"opened"}',
  signature: "sha256=sig",
  secret: "gh_secret",
});
expectType<WebhookVerificationResult<GithubWebhookEvent>>(githubResult);
expectType<GithubWebhookEvent | undefined>(githubResult.payload);

interface SampleGithubPayload {
  action: string;
  issue: {
    number: number;
    title: string;
  };
}

const customGithubResult = await verifyGithubWebhook<SampleGithubPayload>({
  body: '{"action":"opened","issue":{"number":42,"title":"test"}}',
  signature: "sha256=sig",
  secret: "gh_secret",
});
expectType<WebhookVerificationResult<SampleGithubPayload>>(customGithubResult);
expectType<SampleGithubPayload | undefined>(customGithubResult.payload);

const assertedGithub = await assertGithubWebhook<SampleGithubPayload>({
  body: '{"action":"opened","issue":{"number":42,"title":"test"}}',
  signature: "sha256=sig",
  secret: "gh_secret",
});
expectType<SampleGithubPayload>(assertedGithub);

const parsedGhSig = parseGithubSignature("sha256=abcdef");
expectType<string>(parsedGhSig);

expectAssignable<GithubVerifyOptions>({
  body: "test",
  signature: "sha256=sig",
  secret: "gh_secret",
});

// 8. Verify Shopify provider type inference and narrowing
const shopifyResult = await verifyShopifyWebhook({
  body: '{"id":820982911946154500}',
  signature: "1Xxo0QsoTj2ehxeSIaTD+FTpmXYLkjV3cXSSGbFhbls=",
  secret: "shpss_secret",
});
expectType<WebhookVerificationResult<ShopifyWebhookEvent>>(shopifyResult);
expectType<ShopifyWebhookEvent | undefined>(shopifyResult.payload);

interface SampleShopifyPayload {
  id: number;
  total_price: string;
  currency: string;
}

const customShopifyResult = await verifyShopifyWebhook<SampleShopifyPayload>({
  body: '{"id":123,"total_price":"199.99","currency":"USD"}',
  signature: "1Xxo0QsoTj2ehxeSIaTD+FTpmXYLkjV3cXSSGbFhbls=",
  secret: "shpss_secret",
});
expectType<WebhookVerificationResult<SampleShopifyPayload>>(
  customShopifyResult,
);
expectType<SampleShopifyPayload | undefined>(customShopifyResult.payload);

const assertedShopify = await assertShopifyWebhook<SampleShopifyPayload>({
  body: '{"id":123,"total_price":"199.99","currency":"USD"}',
  signature: "1Xxo0QsoTj2ehxeSIaTD+FTpmXYLkjV3cXSSGbFhbls=",
  secret: "shpss_secret",
});
expectType<SampleShopifyPayload>(assertedShopify);

const parsedShopifySig = parseShopifySignature(
  "1Xxo0QsoTj2ehxeSIaTD+FTpmXYLkjV3cXSSGbFhbls=",
);
expectType<string>(parsedShopifySig);

expectAssignable<ShopifyVerifyOptions>({
  body: "test",
  signature: "1Xxo0QsoTj2ehxeSIaTD+FTpmXYLkjV3cXSSGbFhbls=",
  secret: "shpss_secret",
});

const unifiedStripe = await verifyWebhookSignature({
  provider: "stripe",
  body: '{"id":"evt_1"}',
  secret: "whsec_test",
});
expectType<WebhookVerificationResult<StripeWebhookEvent>>(unifiedStripe);

const unifiedCustomStripe = await verifyWebhookSignature<SampleStripePayload>({
  provider: "stripe",
  body: '{"id":"evt_1"}',
  secret: "whsec_test",
});
expectType<WebhookVerificationResult<SampleStripePayload>>(unifiedCustomStripe);

const unifiedGithub = await verifyWebhookSignature({
  provider: "github",
  body: '{"action":"opened"}',
  secret: "gh_secret",
});
expectType<WebhookVerificationResult<GithubWebhookEvent>>(unifiedGithub);

const unifiedShopify = await verifyWebhookSignature({
  provider: "shopify",
  body: '{"id":123}',
  secret: "shpss_secret",
});
expectType<WebhookVerificationResult<ShopifyWebhookEvent>>(unifiedShopify);

const assertedUnifiedStripe = await assertWebhookSignature({
  provider: "stripe",
  body: '{"id":"evt_1"}',
  secret: "whsec_test",
});
expectType<StripeWebhookEvent>(assertedUnifiedStripe);

const assertedUnifiedGithub = await assertWebhookSignature<SampleGithubPayload>(
  {
    provider: "github",
    body: '{"action":"opened"}',
    secret: "gh_secret",
  },
);
expectType<SampleGithubPayload>(assertedUnifiedGithub);

const assertedUnifiedShopify = await assertWebhookSignature({
  provider: "shopify",
  body: '{"id":123}',
  secret: "shpss_secret",
});
expectType<ShopifyWebhookEvent>(assertedUnifiedShopify);

declare const customPlugin: WebhookProviderPlugin<
  SampleShopifyPayload,
  WebhookVerifyOptions
>;

const unifiedPluginResult = await verifyWebhookSignature({
  provider: customPlugin,
  body: '{"id":123}',
  secret: "custom_secret",
});
expectType<WebhookVerificationResult<SampleShopifyPayload>>(
  unifiedPluginResult,
);

const assertedPluginResult = await assertWebhookSignature({
  provider: customPlugin,
  body: '{"id":123}',
  secret: "custom_secret",
});
expectType<SampleShopifyPayload>(assertedPluginResult);

// 9. Verify CryptoKey cache utilities and LRU types
clearCryptoKeyCache();
const cacheSize = getCryptoKeyCacheSize();
expectType<number>(cacheSize);

const cachedKey = await getCachedCryptoKey("SHA-256", "secret");
expectType<CryptoKey>(cachedKey);

const customCache = new CryptoKeyLruCache(100);
expectType<number>(customCache.size);
expectType<number>(customCache.capacity);
expectType<boolean>(customCache.has("key"));
expectType<boolean>(customCache.delete("key"));
customCache.clear();

const nextStripeHandler = createWebhookHandler({
  provider: "stripe",
  secret: "whsec_test",
  onEvent: async (event, meta) => {
    expectType<StripeWebhookEvent>(event);
    expectType<WebhookEventMeta<Request>>(meta);
    expectType<Request>(meta.context);
    expectType<Request>(meta.request);
    expectType<string>(meta.rawBody);
    expectType<number | undefined>(meta.timestamp);
  },
  onError: (error, meta) => {
    expectType<WebhookKitError>(error);
    expectType<WebhookErrorMeta<Request>>(meta);

    return new Response("Unauthorized", { status: 401 });
  },
});
expectType<UniversalWebhookHandler<Request>>(nextStripeHandler);

const nextCustomStripeHandler = createWebhookHandler<SampleStripePayload>({
  provider: "stripe",
  secret: "whsec_test",
  onEvent: (event) => {
    expectType<SampleStripePayload>(event);

    return { received: true };
  },
});
expectType<UniversalWebhookHandler<Request>>(nextCustomStripeHandler);

const nextGithubHandler = createWebhookHandler({
  provider: "github",
  secret: "gh_secret",
  onEvent: (event) => {
    expectType<GithubWebhookEvent>(event);
  },
});
expectType<UniversalWebhookHandler<Request>>(nextGithubHandler);

const nextShopifyHandler = createWebhookHandler({
  provider: "shopify",
  secret: "shpss_secret",
  onEvent: (event) => {
    expectType<ShopifyWebhookEvent>(event);
  },
});
expectType<UniversalWebhookHandler<Request>>(nextShopifyHandler);

const nextPluginHandler = createWebhookHandler({
  provider: customPlugin,
  secret: "custom_secret",
  onEvent: (event) => {
    expectType<SampleShopifyPayload>(event);
  },
});
expectType<UniversalWebhookHandler<Request>>(nextPluginHandler);

const nextGenericHandler = createWebhookHandler({
  secret: "generic_secret",
  onEvent: (event) => {
    expectType<unknown>(event);
  },
});
expectType<UniversalWebhookHandler<Request>>(nextGenericHandler);

interface SampleHonoContext extends WebhookLikeContext {
  readonly env: {
    readonly GITHUB_SECRET: string;
    readonly STRIPE_SECRET: string;
  };
}

const honoGithubHandler = createWebhookHandler({
  provider: "github",
  secret: (c: SampleHonoContext) => c.env.GITHUB_SECRET,
  onEvent: async (event, { context, request }) => {
    expectType<GithubWebhookEvent>(event);
    expectType<SampleHonoContext>(context);
    expectType<Request>(request);
  },
});
expectType<UniversalWebhookHandler<SampleHonoContext>>(honoGithubHandler);

declare function registerHonoRoute(
  path: string,
  handler: (c: SampleHonoContext) => Promise<Response>,
): void;

registerHonoRoute(
  "/api/webhook",
  createWebhookHandler({
    provider: "stripe",
    secret: (c) => c.env.STRIPE_SECRET,
    onEvent: async (event, { context }) => {
      expectType<StripeWebhookEvent>(event);
      expectType<SampleHonoContext>(context);
    },
  }),
);

// 10. Verify WebhookReplayStore and InMemoryReplayStore types
const memoryStore = createInMemoryReplayStore({
  maxSize: 5000,
  defaultTtlSeconds: 300,
});
expectType<InMemoryReplayStore>(memoryStore);
expectAssignable<WebhookReplayStore>(memoryStore);
expectType<boolean>(memoryStore.has("evt_1"));
expectType<void>(memoryStore.set("evt_1", 300));
expectType<number>(memoryStore.prune());

expectAssignable<InMemoryReplayStoreOptions>({
  maxSize: 1000,
  defaultTtlSeconds: 60,
  now: () => Date.now(),
});

const customAsyncStore: WebhookReplayStore = {
  async has(eventId: string) {
    return eventId.length > 0;
  },
  async set(_eventId: string, _ttl: number) {
    return "OK";
  },
};
expectAssignable<WebhookReplayStore>(customAsyncStore);

const replayErr = new ReplayAttackError("evt_dup");
expectType<string>(replayErr.eventId);
expectAssignable<WebhookKitError>(replayErr);

const verifiedWithStore = await verifyWebhookSignature({
  provider: "stripe",
  body: '{"id":"evt_1"}',
  secret: "whsec_test",
  store: customAsyncStore,
  eventId: "evt_1",
  storeTtlSeconds: 300,
});
expectType<string | undefined>(verifiedWithStore.eventId);

const handlerWithStore = createWebhookHandler({
  provider: "stripe",
  secret: "whsec_test",
  store: memoryStore,
  storeTtlSeconds: 600,
  onEvent: (_event, meta) => {
    expectType<string | undefined>(meta.eventId);
  },
});
expectType<UniversalWebhookHandler<Request>>(handlerWithStore);
