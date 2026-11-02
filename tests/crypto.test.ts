import { describe, expect, test } from "vitest";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  computeSubtleHmac,
  hexToBytes,
  timingSafeEqual,
} from "../src/crypto/subtle.js";

describe("timingSafeEqual", () => {
  test("should return true for identical Uint8Array buffers", () => {
    const a = new Uint8Array([1, 2, 3, 4, 5, 255]);
    const b = new Uint8Array([1, 2, 3, 4, 5, 255]);
    expect(timingSafeEqual(a, b)).toBe(true);
  });

  test("should return false for different buffers in constant time", () => {
    const a = new Uint8Array([1, 2, 3, 4, 5, 255]);
    const b = new Uint8Array([1, 2, 3, 4, 5, 254]);
    expect(timingSafeEqual(a, b)).toBe(false);

    const c = new Uint8Array([0, 2, 3, 4, 5, 255]);
    expect(timingSafeEqual(a, c)).toBe(false);
  });

  test("should return false for buffers with mismatched lengths safely", () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 2, 3]);
    expect(timingSafeEqual(a, b)).toBe(false);
    expect(timingSafeEqual(b, a)).toBe(false);

    // Mismatched length where extra byte is zero
    const withZero = new Uint8Array([1, 2, 3, 0]);
    expect(timingSafeEqual(withZero, b)).toBe(false);
    expect(timingSafeEqual(b, withZero)).toBe(false);
  });

  test("should handle empty buffers correctly", () => {
    const emptyA = new Uint8Array([]);
    const emptyB = new Uint8Array([]);
    const nonEmpty = new Uint8Array([1]);

    expect(timingSafeEqual(emptyA, emptyB)).toBe(true);
    expect(timingSafeEqual(emptyA, nonEmpty)).toBe(false);
    expect(timingSafeEqual(nonEmpty, emptyA)).toBe(false);
  });

  test("should support string inputs", () => {
    expect(timingSafeEqual("hello world", "hello world")).toBe(true);
    expect(timingSafeEqual("hello world", "hello worle")).toBe(false);
    expect(timingSafeEqual("hello", "hello world")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("computeSubtleHmac", () => {
  const secret = "key";
  const data = "The quick brown fox jumps over the lazy dog";
  const expectedSha256Hex =
    "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8";
  const expectedSha256Base64 = "97yD9DBThCSxMpjmqm+xQ+9NWaFJRhdZl0edvC0aPNg=";
  const expectedSha384Hex =
    "d7f4727e2c0b39ae0f1e40cc96f60242d5b7801841cea6fc592c5d3e1ae50700582a96cf35e1e554995fe4e03381c237";
  const expectedSha512Hex =
    "b42af09057bac1e2d41708e48a902e09b5ff7f12ab428a4fe86653c73dd248fb82f948a549f7b791a5b41915ee4d1ec3935357e4e2317250d0372afa2ebeeb3a";

  test("should compute valid HMAC-SHA256 digest using crypto.subtle", async () => {
    const digest = await computeSubtleHmac("SHA-256", secret, data);
    expect(digest).toBeInstanceOf(Uint8Array);
    expect(bytesToHex(digest)).toBe(expectedSha256Hex);
  });

  test("should support output encodings: Hex string, Base64 string, and Uint8Array", async () => {
    // Hex string via string param
    const hex = await computeSubtleHmac("SHA-256", secret, data, "hex");
    expect(typeof hex).toBe("string");
    expect(hex).toBe(expectedSha256Hex);

    // Hex string via options object
    const hexOptions = await computeSubtleHmac("SHA-256", secret, data, {
      encoding: "hex",
    });
    expect(hexOptions).toBe(expectedSha256Hex);

    // Base64 string via string param
    const base64 = await computeSubtleHmac("SHA-256", secret, data, "base64");
    expect(typeof base64).toBe("string");
    expect(base64).toBe(expectedSha256Base64);

    // Base64 string via options object
    const base64Options = await computeSubtleHmac("SHA-256", secret, data, {
      encoding: "base64",
    });
    expect(base64Options).toBe(expectedSha256Base64);

    // Uint8Array explicit
    const binary = await computeSubtleHmac(
      "SHA-256",
      secret,
      data,
      "uint8array",
    );
    expect(binary).toBeInstanceOf(Uint8Array);
    expect(bytesToHex(binary)).toBe(expectedSha256Hex);
  });

  test("should support SHA-384 and SHA-512 algorithms", async () => {
    const sha384 = await computeSubtleHmac("SHA-384", secret, data, "hex");
    expect(sha384).toBe(expectedSha384Hex);

    const sha512 = await computeSubtleHmac("SHA-512", secret, data, "hex");
    expect(sha512).toBe(expectedSha512Hex);
  });

  test("should normalize algorithm names (case-insensitive and without hyphens)", async () => {
    const sha256Lower = await computeSubtleHmac("sha256", secret, data, "hex");
    expect(sha256Lower).toBe(expectedSha256Hex);

    const sha384Lower = await computeSubtleHmac("sha-384", secret, data, "hex");
    expect(sha384Lower).toBe(expectedSha384Hex);

    const sha512Mixed = await computeSubtleHmac("SHA512", secret, data, "hex");
    expect(sha512Mixed).toBe(expectedSha512Hex);
  });

  test("should accept Uint8Array inputs for secret and data", async () => {
    const enc = new TextEncoder();
    const secretBytes = enc.encode(secret);
    const dataBytes = enc.encode(data);

    const hex = await computeSubtleHmac(
      "SHA-256",
      secretBytes,
      dataBytes,
      "hex",
    );
    expect(hex).toBe(expectedSha256Hex);
  });

  test("should produce consistent output across Node, Bun, and Edge runtimes", async () => {
    // RFC 4231 Test Case 1:
    // Key: 0x0b repeated 20 times
    // Data: "Hi There"
    // Hash: SHA-256
    // Digest: b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7
    const rfcKey = new Uint8Array(20).fill(0x0b);
    const rfcData = "Hi There";
    const expectedRfcSha256 =
      "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7";

    const digest = await computeSubtleHmac("SHA-256", rfcKey, rfcData, "hex");
    expect(digest).toBe(expectedRfcSha256);
  });
});

describe("encoding helper utilities", () => {
  test("bytesToHex and hexToBytes roundtrip", () => {
    const original = new Uint8Array([0, 1, 15, 16, 255]);
    const hex = bytesToHex(original);
    expect(hex).toBe("00010f10ff");
    const decoded = hexToBytes(hex);
    expect(decoded).toEqual(original);
  });

  test("hexToBytes handles 0x prefix and odd lengths", () => {
    expect(hexToBytes("0x0a0b")).toEqual(new Uint8Array([10, 11]));
    expect(hexToBytes("a")).toEqual(new Uint8Array([10]));
  });

  test("bytesToBase64 and base64ToBytes roundtrip", () => {
    const original = new Uint8Array([72, 101, 108, 108, 111, 33]);
    const b64 = bytesToBase64(original);
    expect(b64).toBe("SGVsbG8h");
    const decoded = base64ToBytes(b64);
    expect(decoded).toEqual(original);
  });
});
