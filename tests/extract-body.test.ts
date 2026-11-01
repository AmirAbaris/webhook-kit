import { describe, test } from "vitest";

describe("extractRawBody", () => {
  test.todo("should pass through string bodies unmodified");
  test.todo("should decode Uint8Array into raw UTF-8 string");
  test.todo("should decode ArrayBuffer into raw UTF-8 string");
  test.todo(
    "should clone and read text from Web Standard Request without consuming original body",
  );
  test.todo("should stream and buffer ReadableStream bytes correctly");
  test.todo("should throw PayloadExtractionError for invalid body inputs");
});
