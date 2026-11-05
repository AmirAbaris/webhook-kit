import { describe, expect, test } from "vitest";
import { extractRawBody } from "../src/utils/extract-body.js";
import { extractHeaderValue } from "../src/utils/headers.js";
import { PayloadExtractionError, WebhookKitError } from "../src/errors.js";
import type { RawBody } from "../src/types.js";

describe("extractRawBody", () => {
  test("should pass through string bodies unmodified", async () => {
    const jsonString =
      '{\n  "event": "payment.succeeded",\n  "amount": 2000\n}  ';
    expect(await extractRawBody(jsonString)).toBe(jsonString);

    expect(await extractRawBody("")).toBe("");
    expect(await extractRawBody("simple string")).toBe("simple string");
    expect(await extractRawBody("🚀 Webhook Payload ⚡️")).toBe(
      "🚀 Webhook Payload ⚡️",
    );
  });

  test("should decode Uint8Array into raw UTF-8 string", async () => {
    const raw = '{"id":"evt_123","status":"active"}';
    const uint8 = new TextEncoder().encode(raw);
    expect(await extractRawBody(uint8)).toBe(raw);

    const emptyUint8 = new Uint8Array([]);
    expect(await extractRawBody(emptyUint8)).toBe("");

    const unicodeRaw = "Unicode: ñ, é, ü, 🚀";
    expect(await extractRawBody(new TextEncoder().encode(unicodeRaw))).toBe(
      unicodeRaw,
    );
  });

  test("should decode ArrayBuffer into raw UTF-8 string", async () => {
    const raw = '{"buffer":true,"size":1024}';
    const buffer = new TextEncoder().encode(raw).buffer;
    expect(await extractRawBody(buffer)).toBe(raw);

    const emptyBuffer = new ArrayBuffer(0);
    expect(await extractRawBody(emptyBuffer)).toBe("");
  });

  test("should decode ArrayBufferView and sliced views correctly", async () => {
    const raw = "prefix_TARGET_PAYLOAD_suffix";
    const bytes = new TextEncoder().encode(raw);
    // Slice "TARGET_PAYLOAD" with offset 7 and length 14
    const view = new Uint8Array(bytes.buffer, 7, 14);
    expect(await extractRawBody(view)).toBe("TARGET_PAYLOAD");

    const dataView = new DataView(bytes.buffer, 7, 14);
    expect(await extractRawBody(dataView)).toBe("TARGET_PAYLOAD");
  });

  test("should clone and read text from Web Standard Request without consuming original body", async () => {
    const payload = '{"webhook":"received","attempt":1}';
    const request = new Request("https://api.example.com/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });

    const extracted = await extractRawBody(request);
    expect(extracted).toBe(payload);

    // WHY: In web frameworks (Next.js, Remix, Hono), downstream route handlers
    // must still be able to consume the original request body.
    expect(request.bodyUsed).toBe(false);
    expect(await request.text()).toBe(payload);
    expect(request.bodyUsed).toBe(true);
  });

  test("should handle Web Standard Request with empty body", async () => {
    const request = new Request("https://api.example.com/webhooks", {
      method: "POST",
    });

    expect(await extractRawBody(request)).toBe("");
  });

  test("should throw PayloadExtractionError when Request body is disturbed", async () => {
    const request = new Request("https://api.example.com/webhooks", {
      method: "POST",
      body: '{"already":"read"}',
    });

    await request.text(); // Consume request body stream
    expect(request.bodyUsed).toBe(true);

    await expect(extractRawBody(request)).rejects.toThrow(
      PayloadExtractionError,
    );
  });

  test("should stream and buffer ReadableStream bytes correctly", async () => {
    const part1 = new TextEncoder().encode('{"stream":');
    const part2 = new TextEncoder().encode('"active"}');

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(part1);
        controller.enqueue(part2);
        controller.close();
      },
    });

    expect(await extractRawBody(stream)).toBe('{"stream":"active"}');
  });

  test("should safely buffer multi-byte UTF-8 sequences split across ReadableStream chunk boundaries", async () => {
    const message = "Multi-byte emoji test: 🚀 and ⚡️ boundary!";
    const encoded = new TextEncoder().encode(message);

    // In UTF-8, 🚀 is 4 bytes: 0xf0 0x9f 0x9a 0x80
    // Split the encoded bytes right through the middle of the rocket emoji
    const splitIndex = 25; // middle of the 4-byte sequence
    const chunk1 = encoded.subarray(0, splitIndex);
    const chunk2 = encoded.subarray(splitIndex);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk1);
        controller.enqueue(chunk2);
        controller.close();
      },
    });

    const result = await extractRawBody(stream);
    expect(result).toBe(message);
    expect(result.includes("\uFFFD")).toBe(false);
  });

  test("should stream chunks with string and ArrayBuffer types", async () => {
    const bufferChunk = new TextEncoder().encode("buffer_chunk ").buffer;

    const stream = new ReadableStream<unknown>({
      start(controller) {
        controller.enqueue("string_chunk ");
        controller.enqueue(bufferChunk);
        controller.close();
      },
    });

    expect(await extractRawBody(stream as ReadableStream<Uint8Array>)).toBe(
      "string_chunk buffer_chunk ",
    );
  });

  test("should handle empty ReadableStream", async () => {
    const emptyStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });

    expect(await extractRawBody(emptyStream)).toBe("");
  });

  test("should throw PayloadExtractionError when ReadableStream is locked", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });

    const reader = stream.getReader(); // Lock the stream

    try {
      await expect(extractRawBody(stream)).rejects.toThrow(
        PayloadExtractionError,
      );
    } finally {
      reader.releaseLock();
    }
  });

  test("should throw PayloadExtractionError when ReadableStream emits an error", async () => {
    const errorStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("Network connection dropped"));
      },
    });

    await expect(extractRawBody(errorStream)).rejects.toThrow(
      PayloadExtractionError,
    );
  });

  test("should throw PayloadExtractionError when ReadableStream contains unsupported chunk type", async () => {
    const badStream = new ReadableStream<unknown>({
      start(controller) {
        controller.enqueue(12345);
        controller.close();
      },
    });

    await expect(
      extractRawBody(badStream as ReadableStream<Uint8Array>),
    ).rejects.toThrow(PayloadExtractionError);
  });

  test("should throw PayloadExtractionError for invalid body inputs", async () => {
    const invalidInputs: unknown[] = [
      null,
      undefined,
      12345,
      true,
      false,
      {},
      { body: "nested" },
      Symbol("payload"),
      () => {},
    ];

    for (const invalid of invalidInputs) {
      await expect(
        extractRawBody(invalid as unknown as RawBody),
      ).rejects.toThrow(PayloadExtractionError);

      try {
        await extractRawBody(invalid as unknown as RawBody);
      } catch (err) {
        expect(err).toBeInstanceOf(PayloadExtractionError);
        expect(err).toBeInstanceOf(WebhookKitError);
        expect((err as PayloadExtractionError).code).toBe(
          "PAYLOAD_EXTRACTION_FAILED",
        );
      }
    }
  });
});

describe("extractHeaderValue", () => {
  test("returns undefined defensively for null, undefined, or non-object headers", () => {
    expect(extractHeaderValue(null, "x-test")).toBeUndefined();
    expect(extractHeaderValue(undefined, "x-test")).toBeUndefined();
    // @ts-expect-error - testing runtime defense against primitive input
    expect(extractHeaderValue("not-headers", "x-test")).toBeUndefined();
    // @ts-expect-error - testing runtime defense against numeric input
    expect(extractHeaderValue(12345, "x-test")).toBeUndefined();
  });

  test("extracts header values case-insensitively from Headers instance or plain record", () => {
    const headers = new Headers();
    headers.set("X-Custom-Header", "custom-value");
    expect(extractHeaderValue(headers, "x-custom-header")).toBe("custom-value");

    const record = {
      "X-API-KEY": "secret-key",
      "content-type": ["text/plain"],
    };
    expect(extractHeaderValue(record, "x-api-key")).toBe("secret-key");
    expect(extractHeaderValue(record, "Content-Type")).toBe("text/plain");
    expect(extractHeaderValue(record, "non-existent")).toBeUndefined();
  });
});
