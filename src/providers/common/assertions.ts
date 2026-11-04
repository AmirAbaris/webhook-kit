import { InvalidSignatureHeaderError } from "../../errors.js";

/**
 * Asserts that a header value is a non-empty string.
 *
 * @param header - Candidate header value.
 * @param errorMessage - Error message to throw if header is invalid or missing.
 */
export function assertNonEmptyHeader(
  header: unknown,
  errorMessage: string,
): asserts header is string {
  if (typeof header !== "string" || !header.trim()) {
    throw new InvalidSignatureHeaderError(errorMessage);
  }
}
