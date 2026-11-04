import type { HeaderRecord } from "../types.js";

/**
 * Case-insensitively extracts a header value from a `Headers` instance or plain record.
 *
 * @param headers - Web standard `Headers` instance or record.
 * @param targetName - Lowercase target header name.
 * @returns Header value string or undefined.
 */
export function extractHeaderValue(
  headers: HeaderRecord,
  targetName: string,
): string | undefined {
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return headers.get(targetName) ?? undefined;
  }

  const record = headers as Record<string, string | string[] | undefined>;
  const lowerTarget = targetName.toLowerCase();

  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === lowerTarget) {
      const value = record[key];

      return Array.isArray(value) ? value[0] : value;
    }
  }

  return undefined;
}
