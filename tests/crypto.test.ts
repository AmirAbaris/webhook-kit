import { describe, test } from "vitest";

describe("timingSafeEqual", () => {
  test.todo("should return true for identical Uint8Array buffers");
  test.todo("should return false for different buffers in constant time");
  test.todo("should return false for buffers with mismatched lengths safely");
});

describe("computeSubtleHmac", () => {
  test.todo("should compute valid HMAC-SHA256 digest using crypto.subtle");
  test.todo("should support SHA-384 and SHA-512 algorithms");
  test.todo(
    "should produce consistent output across Node, Bun, and Edge runtimes",
  );
});
