import type { RawBody } from "../types.js";
import { PayloadExtractionError } from "../errors.js";

/**
 * Safely extracts the unmodified raw string body from various input representations:
 * Web Standard `Request`, `ReadableStream`, `Uint8Array`, `ArrayBuffer`, or primitive `string`.
 *
 * @param body - The raw request or body object
 * @returns Unmodified string representation suitable for cryptographic HMAC verification
 * @throws {PayloadExtractionError} if body cannot be read or is invalid
 */
export async function extractRawBody(body: RawBody): Promise<string> {
  // TODO: Implement full stream-handling, clone-safe Web Standard Request body reading,
  // and binary encoding normalization in upcoming feature PRs.
  if (typeof body === "string") {
    return body;
  }

  if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  }

  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }

  if (typeof Request !== "undefined" && body instanceof Request) {
    try {
      return await body.clone().text();
    } catch (err) {
      throw new PayloadExtractionError(
        `Failed to read text from Request body: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (body && typeof (body as ReadableStream).getReader === "function") {
    // TODO: Stream reader stub for edge environments
    throw new PayloadExtractionError(
      "ReadableStream extraction stub: full implementation pending",
    );
  }

  throw new PayloadExtractionError(
    "Unsupported body type. Expected string, Uint8Array, ArrayBuffer, or Request.",
  );
}
