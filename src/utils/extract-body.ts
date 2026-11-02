import type { RawBody } from "../types.js";
import { PayloadExtractionError } from "../errors.js";

/**
 * Checks whether an unknown value is a binary BufferSource (ArrayBuffer or ArrayBufferView).
 *
 * @param value Candidate value.
 * @returns `true` if the value is an ArrayBuffer or ArrayBufferView.
 */
function isBinarySource(value: unknown): value is BufferSource {
  return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

/**
 * Checks whether an unknown value is a Web Standard `Request`.
 *
 * @param value Candidate value.
 * @returns `true` if the value is a Request instance.
 */
function isRequest(value: unknown): value is Request {
  return typeof Request !== "undefined" && value instanceof Request;
}

/**
 * Checks whether an unknown value is a Web Standard `ReadableStream`.
 *
 * @param value Candidate value.
 * @returns `true` if the value exposes a stream reader.
 */
function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ReadableStream<Uint8Array>).getReader === "function"
  );
}

/**
 * Clones and reads text from a Web Standard `Request` without consuming the original body.
 *
 * @param request Incoming `Request` instance.
 * @returns Raw UTF-8 body string.
 */
async function readRequestBody(request: Request): Promise<string> {
  try {
    // WHY: Clone the Request before reading so downstream framework handlers
    // can still read the original request body stream if needed.
    return await request.clone().text();
  } catch (err) {
    throw new PayloadExtractionError(
      `Failed to read text from Request body: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Decodes a single chunk from a ReadableStream using a streaming TextDecoder.
 *
 * @param decoder Streaming TextDecoder instance.
 * @param chunk Incoming chunk value.
 * @returns Decoded string chunk.
 */
function decodeStreamChunk(decoder: TextDecoder, chunk: unknown): string {
  if (typeof chunk === "string") {
    return chunk;
  }

  if (isBinarySource(chunk)) {
    // WHY: Use { stream: true } while decoding chunks so multi-byte UTF-8 sequences
    // split across chunk boundaries are buffered rather than corrupted with replacement characters.
    return decoder.decode(chunk, { stream: true });
  }

  throw new PayloadExtractionError(
    `Unsupported stream chunk type: expected binary or string, received ${typeof chunk}`,
  );
}

/**
 * Reads all chunks from a Web Standard `ReadableStream` into a complete UTF-8 string.
 *
 * @param stream Incoming `ReadableStream` instance.
 * @returns Complete raw string body.
 */
async function readReadableStream(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  try {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let result = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        result += decodeStreamChunk(decoder, value);
      }

      // WHY: Final decode call with no arguments flushes any remaining buffered multi-byte characters.
      result += decoder.decode();

      return result;
    } finally {
      reader.releaseLock();
    }
  } catch (err) {
    if (err instanceof PayloadExtractionError) {
      throw err;
    }

    throw new PayloadExtractionError(
      `Failed to read text from ReadableStream: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Safely extracts the unmodified raw string body from various input representations:
 * Web Standard `Request`, `ReadableStream`, `Uint8Array`, `ArrayBuffer`, `ArrayBufferView`, or primitive `string`.
 *
 * @param body The raw request or body object.
 * @returns Unmodified string representation suitable for cryptographic HMAC verification.
 * @throws {PayloadExtractionError} If body cannot be read or is invalid.
 */
export async function extractRawBody(body: RawBody): Promise<string> {
  if (typeof body === "string") {
    return body;
  }

  if (isBinarySource(body)) {
    return new TextDecoder().decode(body);
  }

  if (isRequest(body)) {
    return readRequestBody(body);
  }

  if (isReadableStream(body)) {
    return readReadableStream(body);
  }

  throw new PayloadExtractionError(
    "Unsupported body type. Expected string, Uint8Array, ArrayBuffer, ReadableStream, or Request.",
  );
}
