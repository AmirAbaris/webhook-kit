import { describe, expect, test } from "vitest";
import {
  assertGithubWebhook,
  assertShopifyWebhook,
  assertStripeWebhook,
  assertWebhookSignature,
  checkAndRecordReplay,
  computeSubtleHmac,
  createInMemoryReplayStore,
  createWebhookHandler,
  InMemoryReplayStore,
  ReplayAttackError,
  resolveWebhookEventId,
  SignatureVerificationError,
  type WebhookLikeContext,
  type WebhookProviderPlugin,
  type WebhookReplayStore,
  type WebhookVerifyOptions,
  verifyGithubWebhook,
  verifyShopifyWebhook,
  verifyStripeWebhook,
  verifyWebhookSignature,
} from "../src/index.js";

const SECRET = "whsec_replay_store_test_secret";

describe("InMemoryReplayStore & createInMemoryReplayStore", () => {
  test("tracks event IDs within TTL and expires them after TTL elapses", () => {
    let currentMs = 1_700_000_000_000;
    const store = createInMemoryReplayStore({
      defaultTtlSeconds: 60,
      now: () => currentMs,
    });

    expect(store).toBeInstanceOf(InMemoryReplayStore);
    expect(store.capacity).toBe(10_000);
    expect(store.has("evt_01")).toBe(false);

    store.set("evt_01", 30);
    expect(store.has("evt_01")).toBe(true);
    expect(store.size).toBe(1);

    // Advance 29.9s -> still active
    currentMs += 29_900;
    expect(store.has("evt_01")).toBe(true);

    // Advance past 30s -> expired and lazily removed
    currentMs += 200;
    expect(store.has("evt_01")).toBe(false);
    expect(store.size).toBe(0);
  });

  test("uses defaultTtlSeconds when ttl is omitted or non-finite, and deletes when ttl <= 0", () => {
    let currentMs = 1_700_000_000_000;
    const store = new InMemoryReplayStore({
      defaultTtlSeconds: 100,
      now: () => currentMs,
    });

    store.set("evt_default");
    store.set("evt_nan", Number.NaN);

    currentMs += 99_000;
    expect(store.has("evt_default")).toBe(true);
    expect(store.has("evt_nan")).toBe(true);

    currentMs += 2_000;
    expect(store.has("evt_default")).toBe(false);
    expect(store.has("evt_nan")).toBe(false);

    store.set("evt_temp", 60);
    expect(store.has("evt_temp")).toBe(true);
    store.set("evt_temp", 0);
    expect(store.has("evt_temp")).toBe(false);
  });

  test("evicts expired entries first and falls back to LRU eviction when maxSize is reached", () => {
    let currentMs = 1_700_000_000_000;
    const store = createInMemoryReplayStore({
      maxSize: 3,
      now: () => currentMs,
    });

    store.set("evt_1", 10);
    store.set("evt_2", 100);
    store.set("evt_3", 100);
    expect(store.size).toBe(3);

    // Advance 15s so evt_1 is expired; adding evt_4 prunes evt_1 without evicting evt_2
    currentMs += 15_000;
    store.set("evt_4", 100);
    expect(store.size).toBe(3);
    expect(store.has("evt_1")).toBe(false);
    expect(store.has("evt_2")).toBe(true);
    expect(store.has("evt_3")).toBe(true);
    expect(store.has("evt_4")).toBe(true);

    // Refresh evt_2 by re-setting it, making evt_3 the oldest entry
    store.set("evt_2", 100);
    store.set("evt_5", 100);
    expect(store.size).toBe(3);
    expect(store.has("evt_3")).toBe(false);
    expect(store.has("evt_2")).toBe(true);
    expect(store.has("evt_4")).toBe(true);
    expect(store.has("evt_5")).toBe(true);

    expect(store.delete("evt_2")).toBe(true);
    expect(store.has("evt_2")).toBe(false);

    store.clear();
    expect(store.size).toBe(0);
  });

  test("supports atomic setNx, returning true for new entries and false for existing or unexpired entries", () => {
    let currentMs = 1_700_000_000_000;
    const store = createInMemoryReplayStore({
      defaultTtlSeconds: 50,
      now: () => currentMs,
    });

    expect(store.setNx("evt_atom_1", 30)).toBe(true);
    expect(store.has("evt_atom_1")).toBe(true);

    // Duplicate call returns false and does not reset expiration
    expect(store.setNx("evt_atom_1", 100)).toBe(false);

    // Advance 31 seconds: expired
    currentMs += 31_000;
    expect(store.has("evt_atom_1")).toBe(false);

    // After expiration, setNx succeeds again
    expect(store.setNx("evt_atom_1", 30)).toBe(true);
  });

  test("defensively sanitizes invalid constructor options and ignores invalid eventId keys", () => {
    const invalidStore = new InMemoryReplayStore({
      maxSize: -10,
      defaultTtlSeconds: Number.NaN,
    });

    expect(invalidStore.capacity).toBe(10_000);

    // Non-string or empty keys are ignored gracefully without throwing
    invalidStore.set("");
    expect(invalidStore.has("")).toBe(false);
    expect(invalidStore.delete("")).toBe(false);
    expect(invalidStore.size).toBe(0);

    // @ts-expect-error - testing runtime defense against invalid types
    invalidStore.set(null);
    // @ts-expect-error - testing runtime defense against invalid types
    expect(invalidStore.has(null)).toBe(false);
    // @ts-expect-error - testing runtime defense against invalid types
    expect(invalidStore.delete(null)).toBe(false);
  });

  test("throttles full prune scans to once per second under continuous maximum capacity", () => {
    let currentMs = 1_700_000_000_000;
    const store = createInMemoryReplayStore({
      maxSize: 2,
      now: () => currentMs,
    });

    store.set("evt_1", 100);
    store.set("evt_2", 100);
    expect(store.size).toBe(2);

    // Rapid inserts within 100ms exceed capacity without triggering redundant O(N) full prune iterations
    currentMs += 50;
    store.set("evt_3", 100);
    expect(store.size).toBe(2);
    expect(store.has("evt_1")).toBe(false);
    expect(store.has("evt_3")).toBe(true);
  });
});

describe("resolveWebhookEventId & checkAndRecordReplay", () => {
  test("resolves event ID from explicit option, headers, Request headers, or payload id", () => {
    expect(
      resolveWebhookEventId({
        eventId: "  explicit_evt_123  ",
        headers: { "x-webhook-id": "header_evt" },
        payload: { id: "payload_evt" },
      }),
    ).toBe("explicit_evt_123");

    expect(
      resolveWebhookEventId({
        headers: { "X-GitHub-Delivery": "gh_deliv_99" },
        payload: { id: "payload_evt" },
      }),
    ).toBe("gh_deliv_99");

    const req = new Request("https://example.com/webhook", {
      method: "POST",
      headers: { "x-shopify-webhook-id": "shop_wh_77" },
      body: '{"id":123}',
    });

    expect(
      resolveWebhookEventId({
        body: req,
      }),
    ).toBe("shop_wh_77");

    expect(
      resolveWebhookEventId({
        payload: { id: 820982911946154500 },
      }),
    ).toBe("820982911946154500");

    expect(
      resolveWebhookEventId({
        rawBody: '{"id":"evt_from_raw_json"}',
      }),
    ).toBe("evt_from_raw_json");

    expect(
      resolveWebhookEventId({
        rawBody: "not-json-body",
      }),
    ).toBeUndefined();
  });

  test("checkAndRecordReplay supports custom async KV stores (Redis / Upstash / Cloudflare KV style)", async () => {
    const kvMap = new Map<string, { value: string; ttl: number }>();

    const customAsyncStore: WebhookReplayStore = {
      async has(eventId) {
        return kvMap.has(`webhook:replay:${eventId}`);
      },
      async set(eventId, ttl) {
        kvMap.set(`webhook:replay:${eventId}`, { value: "1", ttl });

        return "OK";
      },
    };

    const firstCheck = await checkAndRecordReplay({
      store: customAsyncStore,
      eventId: "evt_async_1",
      storeTtlSeconds: 600,
    });

    expect(firstCheck).toBeNull();
    expect(kvMap.get("webhook:replay:evt_async_1")).toEqual({
      value: "1",
      ttl: 600,
    });

    const replayCheck = await checkAndRecordReplay({
      store: customAsyncStore,
      eventId: "evt_async_1",
      storeTtlSeconds: 600,
    });

    expect(replayCheck).toBeInstanceOf(ReplayAttackError);
    expect(replayCheck?.code).toBe("WEBHOOK_REPLAY_DETECTED");
    expect(replayCheck?.eventId).toBe("evt_async_1");
  });

  test("prevents TOCTOU race conditions under concurrent requests using InMemoryReplayStore", async () => {
    const store = createInMemoryReplayStore();
    const eventId = "evt_race_condition_mem";

    // Two concurrent requests hitting the store simultaneously
    const [res1, res2] = await Promise.all([
      checkAndRecordReplay({ store, eventId, storeTtlSeconds: 300 }),
      checkAndRecordReplay({ store, eventId, storeTtlSeconds: 300 }),
    ]);

    // Exactly one must succeed (null) and the other must be rejected (ReplayAttackError)
    const successCount = (res1 === null ? 1 : 0) + (res2 === null ? 1 : 0);
    const errorCount =
      (res1 instanceof ReplayAttackError ? 1 : 0) +
      (res2 instanceof ReplayAttackError ? 1 : 0);

    expect(successCount).toBe(1);
    expect(errorCount).toBe(1);
  });

  test("prevents TOCTOU race conditions under concurrent requests with async stores via in-flight serialization", async () => {
    const kv = new Set<string>();

    // Simulated async store with 10ms network delay and no atomic setNx
    const slowAsyncStore: WebhookReplayStore = {
      async has(eventId) {
        await new Promise((resolve) => setTimeout(resolve, 10));

        return kv.has(eventId);
      },
      async set(eventId) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        kv.add(eventId);
      },
    };

    const eventId = "evt_race_async_kv";

    const [resA, resB] = await Promise.all([
      checkAndRecordReplay({
        store: slowAsyncStore,
        eventId,
        storeTtlSeconds: 60,
      }),
      checkAndRecordReplay({
        store: slowAsyncStore,
        eventId,
        storeTtlSeconds: 60,
      }),
    ]);

    const successCount = (resA === null ? 1 : 0) + (resB === null ? 1 : 0);
    const errorCount =
      (resA instanceof ReplayAttackError ? 1 : 0) +
      (resB instanceof ReplayAttackError ? 1 : 0);

    expect(successCount).toBe(1);
    expect(errorCount).toBe(1);
  });

  test("resolves svix-id header and numeric explicit event IDs while gracefully ignoring array payloads", () => {
    expect(
      resolveWebhookEventId({
        headers: { "svix-id": "msg_2d3wE93" },
      }),
    ).toBe("msg_2d3wE93");

    // @ts-expect-error - testing runtime defense against numeric explicit eventId
    expect(resolveWebhookEventId({ eventId: 987654321 })).toBe("987654321");

    expect(
      resolveWebhookEventId({
        payload: [{ id: "array_item" }],
      }),
    ).toBeUndefined();
  });
});

describe("Replay Store Integration across Providers & Route Handler", () => {
  test("rejects replayed Stripe webhooks with ReplayAttackError while ignoring invalid signature attempts", async () => {
    const store = createInMemoryReplayStore();
    const now = 1_700_000_000;
    const rawBody = JSON.stringify({
      id: "evt_stripe_replay_01",
      object: "event",
      type: "payment_intent.succeeded",
      created: now,
      data: { object: { id: "pi_1" } },
    });
    const sig = await computeSubtleHmac(
      "SHA-256",
      SECRET,
      `${now}.${rawBody}`,
      "hex",
    );
    const header = `t=${now},v1=${sig}`;

    // 1. Forged attempt with same event ID must fail signature check and NOT poison the replay store
    const forgedAttempt = await verifyStripeWebhook({
      body: rawBody,
      signature: `t=${now},v1=deadbeef`,
      secret: SECRET,
      currentTimestamp: now,
      store,
    });

    expect(forgedAttempt.valid).toBe(false);
    expect(forgedAttempt.error).toBeInstanceOf(SignatureVerificationError);
    expect(store.has("evt_stripe_replay_01")).toBe(false);

    // 2. First valid delivery succeeds and records eventId in store
    const firstValid = await verifyStripeWebhook({
      body: rawBody,
      signature: header,
      secret: SECRET,
      currentTimestamp: now,
      toleranceSeconds: 300,
      store,
    });

    expect(firstValid.valid).toBe(true);
    expect(firstValid.eventId).toBe("evt_stripe_replay_01");
    expect(store.has("evt_stripe_replay_01")).toBe(true);

    // 3. Replayed identical delivery is rejected with ReplayAttackError
    const replayed = await verifyStripeWebhook({
      body: rawBody,
      signature: header,
      secret: SECRET,
      currentTimestamp: now + 5,
      toleranceSeconds: 300,
      store,
    });

    expect(replayed.valid).toBe(false);
    expect(replayed.eventId).toBe("evt_stripe_replay_01");
    expect(replayed.error).toBeInstanceOf(ReplayAttackError);
    expect((replayed.error as ReplayAttackError).eventId).toBe(
      "evt_stripe_replay_01",
    );

    // 4. assertStripeWebhook throws ReplayAttackError on replay
    await expect(
      assertStripeWebhook({
        body: rawBody,
        signature: header,
        secret: SECRET,
        currentTimestamp: now + 5,
        store,
      }),
    ).rejects.toThrow(ReplayAttackError);
  });

  test("rejects replayed GitHub webhooks using X-GitHub-Delivery header", async () => {
    const store = createInMemoryReplayStore();
    const rawBody = JSON.stringify({ action: "opened", number: 10 });
    const sig = await computeSubtleHmac("SHA-256", SECRET, rawBody, "hex");
    const headers = {
      "X-Hub-Signature-256": `sha256=${sig}`,
      "X-GitHub-Delivery": "72d3162e-cc78-11e3-81ab-4c9367dc0958",
    };

    const first = await verifyGithubWebhook({
      body: rawBody,
      headers,
      secret: SECRET,
      store,
    });

    expect(first.valid).toBe(true);
    expect(first.eventId).toBe("72d3162e-cc78-11e3-81ab-4c9367dc0958");

    const duplicate = await verifyGithubWebhook({
      body: rawBody,
      headers,
      secret: SECRET,
      store,
    });

    expect(duplicate.valid).toBe(false);
    expect(duplicate.error).toBeInstanceOf(ReplayAttackError);

    await expect(
      assertGithubWebhook({
        body: rawBody,
        headers,
        secret: SECRET,
        store,
      }),
    ).rejects.toThrow(ReplayAttackError);
  });

  test("rejects replayed Shopify webhooks using X-Shopify-Webhook-Id header or payload id", async () => {
    const store = createInMemoryReplayStore();
    const rawBody = JSON.stringify({ id: 9988776655, total_price: "49.00" });
    const sig = await computeSubtleHmac("SHA-256", SECRET, rawBody, "base64");

    const first = await verifyShopifyWebhook({
      body: rawBody,
      signature: sig,
      headers: { "X-Shopify-Webhook-Id": "b54557e4-49c0-476a-8f34" },
      secret: SECRET,
      store,
    });

    expect(first.valid).toBe(true);
    expect(first.eventId).toBe("b54557e4-49c0-476a-8f34");

    const second = await verifyShopifyWebhook({
      body: rawBody,
      signature: sig,
      headers: { "X-Shopify-Webhook-Id": "b54557e4-49c0-476a-8f34" },
      secret: SECRET,
      store,
    });

    expect(second.valid).toBe(false);
    expect(second.error).toBeInstanceOf(ReplayAttackError);

    await expect(
      assertShopifyWebhook({
        body: rawBody,
        signature: sig,
        headers: { "X-Shopify-Webhook-Id": "b54557e4-49c0-476a-8f34" },
        secret: SECRET,
        store,
      }),
    ).rejects.toThrow(ReplayAttackError);
  });

  test("rejects replayed generic and custom plugin webhooks via unified verifyWebhookSignature", async () => {
    const store = createInMemoryReplayStore();
    const rawBody = '{"id":"evt_generic_unique_1","type":"user.updated"}';
    const sig = await computeSubtleHmac("SHA-256", SECRET, rawBody, "hex");

    const firstGeneric = await verifyWebhookSignature({
      body: rawBody,
      signature: sig,
      secret: SECRET,
      store,
      storeTtlSeconds: 120,
    });

    expect(firstGeneric.valid).toBe(true);
    expect(firstGeneric.eventId).toBe("evt_generic_unique_1");

    const secondGeneric = await verifyWebhookSignature({
      body: rawBody,
      signature: sig,
      secret: SECRET,
      store,
    });

    expect(secondGeneric.valid).toBe(false);
    expect(secondGeneric.error).toBeInstanceOf(ReplayAttackError);

    await expect(
      assertWebhookSignature({
        body: rawBody,
        signature: sig,
        secret: SECRET,
        store,
      }),
    ).rejects.toThrow(ReplayAttackError);

    const customPlugin: WebhookProviderPlugin<
      { id: string },
      WebhookVerifyOptions
    > = {
      name: "custom-plugin",
      async verify(opts) {
        return {
          valid: true,
          rawBody: String(opts.body),
          payload: { id: "evt_custom_plugin_1" },
        };
      },
    };

    const pluginFirst = await verifyWebhookSignature({
      provider: customPlugin,
      body: '{"id":"evt_custom_plugin_1"}',
      secret: SECRET,
      store,
    });

    expect(pluginFirst.valid).toBe(true);
    expect(pluginFirst.eventId).toBe("evt_custom_plugin_1");

    const pluginReplay = await verifyWebhookSignature({
      provider: customPlugin,
      body: '{"id":"evt_custom_plugin_1"}',
      secret: SECRET,
      store,
    });

    expect(pluginReplay.valid).toBe(false);
    expect(pluginReplay.error).toBeInstanceOf(ReplayAttackError);
  });

  test("createWebhookHandler returns 409 Conflict on duplicate replay and supports dynamic store resolver", async () => {
    interface HonoEnvContext extends WebhookLikeContext {
      readonly env: {
        readonly SECRET: string;
        readonly STORE: WebhookReplayStore;
      };
    }

    const store = createInMemoryReplayStore();
    let processedCount = 0;
    let capturedEventId: string | undefined;

    const handler = createWebhookHandler({
      provider: "github",
      secret: (c: HonoEnvContext) => c.env.SECRET,
      store: (c: HonoEnvContext) => c.env.STORE,
      onEvent: (_event, meta) => {
        processedCount += 1;
        capturedEventId = meta.eventId;

        return { ok: true };
      },
    });

    const rawBody = JSON.stringify({ action: "Synchronize" });
    const sig = await computeSubtleHmac("SHA-256", SECRET, rawBody, "hex");

    const makeContext = (): HonoEnvContext => ({
      req: {
        raw: new Request("https://example.com/webhooks/github", {
          method: "POST",
          headers: {
            "x-hub-signature-256": `sha256=${sig}`,
            "x-github-delivery": "delivery_id_001",
          },
          body: rawBody,
        }),
      },
      env: {
        SECRET,
        STORE: store,
      },
    });

    const res1 = await handler(makeContext());
    expect(res1.status).toBe(200);
    expect(processedCount).toBe(1);
    expect(capturedEventId).toBe("delivery_id_001");

    const res2 = await handler(makeContext());
    expect(res2.status).toBe(409);
    expect(processedCount).toBe(1);
    expect(await res2.json()).toEqual({
      error: {
        code: "WEBHOOK_REPLAY_DETECTED",
        message: expect.stringContaining("delivery_id_001"),
      },
    });
  });
});
