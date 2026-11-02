import type { RawBody } from "../types.js";
import { PayloadExtractionError } from "../errors.js";

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
 * Checks whether an unknown value is a Web Standard `ReadableStream`.
 *
 * @param value Candidate value.
 * @returns `true` if the value exposes a stream reader.
 */
function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ReadableStream).getReader === "function"
  );
}

/**
 * Safely extracts the unmodified raw string body from various input representations:
 * Web Standard `Request`, `ReadableStream`, `Uint8Array`, `ArrayBuffer`, or primitive `string`.
 *
 * @param body The raw request or body object.
 * @returns Unmodified string representation suitable for cryptographic HMAC verification.
 * @throws {PayloadExtractionError} If body cannot be read or is invalid.
 */
export async function extractRawBody(body: RawBody): Promise<string> {
  if (typeof body === "string") {
    return body;
  }

  if (body instanceof Uint8Array || body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }

  if (typeof Request !== "undefined" && body instanceof Request) {
    return readRequestBody(body);
  }

  if (isReadableStream(body)) {
    // TODO: Stream reader stub for edge environments
    throw new PayloadExtractionError(
      "ReadableStream extraction stub: full implementation pending",
    );
  }

  throw new PayloadExtractionError(
    "Unsupported body type. Expected string, Uint8Array, ArrayBuffer, or Request.",
  );
}
