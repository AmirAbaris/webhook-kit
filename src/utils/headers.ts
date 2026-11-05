import type { HeaderRecord } from "../types.js";

/**
 * Extracts a header value from a plain headers record case-insensitively.
 *
 * @param record - Plain headers record object.
 * @param lowerTarget - Pre-lowercased target header name.
 * @returns Header value string or undefined.
 */
function extractFromRecord(
  record: Record<string, string | string[] | undefined>,
  lowerTarget: string,
): string | undefined {
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === lowerTarget) {
      const value = record[key];

      return Array.isArray(value) ? value[0] : value;
    }
  }

  return undefined;
}

/**
 * Case-insensitively extracts a header value from a `Headers` instance or plain record.
 *
 * @param headers - Web standard `Headers` instance or record.
 * @param targetName - Lowercase target header name.
 * @returns Header value string or undefined.
 */
export function extractHeaderValue(
  headers: HeaderRecord | undefined | null,
  targetName: string,
): string | undefined {
  if (!headers || typeof headers !== "object") {
    return undefined;
  }

  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return headers.get(targetName) ?? undefined;
  }

  return extractFromRecord(
    headers as Record<string, string | string[] | undefined>,
    targetName.toLowerCase(),
  );
}
