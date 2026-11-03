import { PayloadExtractionError, WebhookKitError } from "./errors.js";
import type { GithubWebhookEvent } from "./providers/github.js";
import type { ShopifyWebhookEvent } from "./providers/shopify.js";
import type { StripeWebhookEvent } from "./providers/stripe.js";
import type {
  BuiltinProviderName,
  SupportedAlgorithm,
  WebhookProviderPlugin,
  WebhookVerificationSuccess,
} from "./types.js";
import { verifyWebhookSignature } from "./verify.js";

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

const DEFAULT_SUCCESS_BODY = JSON.stringify({ received: true });

/**
 * Structural duck-type for Hono's `Context` (and compatible edge routers that expose
 * the underlying Web Standard `Request` at `req.raw`).
 */
export interface WebhookLikeContext {
  readonly req: {
    readonly raw: Request;
  };
}

/**
 * Supported first-argument inputs to a universal webhook route handler:
 * - Web Standard `Request` (Next.js App Router, Remix, SvelteKit, Astro, Cloudflare Workers, Bun, Deno)
 * - Framework context object exposing `{ req: { raw: Request } }` (Hono)
 */
export type WebhookRequestInput = Request | WebhookLikeContext;

/**
 * Static secret value or dynamic secret resolver function.
 */
export type SecretResolver<TContext = Request> =
  | string
  | Uint8Array
  | ((
      context: TContext,
      request: Request,
    ) => string | Uint8Array | Promise<string | Uint8Array>);

/**
 * Metadata passed as the second argument to `onEvent` alongside the verified payload.
 */
export interface WebhookEventMeta<TContext = Request> {
  readonly context: TContext;
  readonly request: Request;
  readonly rawBody: string;
  readonly timestamp?: number;
}

/**
 * Metadata passed as the second argument to `onError` when verification fails.
 */
export interface WebhookErrorMeta<TContext = Request> {
  readonly context: TContext;
  readonly request: Request;
  readonly rawBody?: string;
  readonly timestamp?: number;
}

/**
 * Return value allowed from `onEvent`.
 */
export type WebhookHandlerReturn =
  Response | Record<string, unknown> | void | undefined;

/**
 * Configuration options for `createWebhookHandler`.
 */
export interface WebhookHandlerOptions<
  TPayload = unknown,
  TContext extends WebhookRequestInput = Request,
> {
  /**
   * Optional built-in provider name (`'stripe'`, `'github'`, `'shopify'`) or custom provider plugin.
   * When omitted, generic HMAC verification is performed.
   */
  provider?: BuiltinProviderName | WebhookProviderPlugin<TPayload, never>;

  /**
   * Shared signing secret or dynamic resolver function receiving `(context, request)`.
   */
  secret: SecretResolver<TContext>;

  /**
   * Callback invoked after the webhook signature and timestamp have been verified.
   */
  onEvent: (
    event: TPayload,
    meta: WebhookEventMeta<TContext>,
  ) => WebhookHandlerReturn | Promise<WebhookHandlerReturn>;

  /**
   * Optional custom error responder invoked when signature verification or body extraction fails.
   */
  onError?: (
    error: WebhookKitError,
    meta: WebhookErrorMeta<TContext>,
  ) => Response | Promise<Response>;

  /**
   * Cryptographic hash algorithm for generic HMAC verification. Defaults to `'SHA-256'`.
   */
  algorithm?: SupportedAlgorithm;

  /**
   * Signature digest encoding for generic HMAC verification. Defaults to `'hex'`.
   */
  encoding?: "hex" | "base64";

  /**
   * Maximum allowed age of the webhook in seconds to mitigate replay attacks.
   */
  toleranceSeconds?: number;

  /**
   * Current Unix timestamp in seconds (defaults to `Math.floor(Date.now() / 1000)`).
   */
  currentTimestamp?: number;

  /**
   * Whether to automatically parse the verified body as JSON. Defaults to `true`.
   */
  parseJson?: boolean;
}

/**
 * Universal webhook route handler function produced by `createWebhookHandler`.
 */
export type UniversalWebhookHandler<
  TContext extends WebhookRequestInput = Request,
> = (input: TContext) => Promise<Response>;

/**
 * Creates a JSON `Response` with UTF-8 content-type headers.
 *
 * @param body - Serialized JSON string.
 * @param status - HTTP status code.
 * @returns Web Standard `Response`.
 */
function createJsonResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": JSON_CONTENT_TYPE,
    },
  });
}

/**
 * Converts a `WebhookKitError` into a structured JSON HTTP error `Response`.
 *
 * @param error - Verification or extraction error.
 * @returns `400` response for payload extraction errors, or `401` for verification errors.
 */
function createErrorResponse(error: WebhookKitError): Response {
  // WHY: Map stream/body extraction failures to 400 Bad Request, while all
  // cryptographic or header verification failures return 401 Unauthorized.
  const status = error instanceof PayloadExtractionError ? 400 : 401;

  return createJsonResponse(
    JSON.stringify({
      error: {
        code: error.code,
        message: error.message,
      },
    }),
    status,
  );
}

/**
 * Checks whether an unknown value is a non-null object record.
 *
 * @param value - Candidate value.
 * @returns `true` if `value` is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Extracts a Web Standard `Request` from a framework context object (`{ req: { raw: Request } }`).
 *
 * @param value - Candidate context object.
 * @returns Extracted `Request` or `null` if not present.
 */
function extractRequestFromContext(value: unknown): Request | null {
  if (!isRecord(value) || !isRecord(value.req)) {
    return null;
  }

  return typeof Request !== "undefined" && value.req.raw instanceof Request
    ? value.req.raw
    : null;
}

/**
 * Unwraps a Web Standard `Request` from either a direct `Request` or a `WebhookLikeContext`.
 *
 * @param input - Handler first argument.
 * @returns Underlying `Request` or `null` if invalid.
 */
function unwrapRequest(input: unknown): Request | null {
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input;
  }

  return extractRequestFromContext(input);
}

/**
 * Resolves the signing secret from a static value or dynamic secret resolver function.
 *
 * @param secret - Static secret or resolver function.
 * @param context - Original handler input (`Request` or framework context).
 * @param request - Unwrapped Web Standard `Request`.
 * @returns Resolved secret string or byte array.
 */
async function resolveSecret<TContext extends WebhookRequestInput>(
  secret: SecretResolver<TContext>,
  context: TContext,
  request: Request,
): Promise<string | Uint8Array> {
  if (typeof secret === "function") {
    return secret(context, request);
  }

  return secret;
}

/**
 * Converts the return value of `onEvent` into a Web Standard `Response`.
 *
 * @param output - Return value from `onEvent`.
 * @returns Web Standard `Response`.
 */
function formatSuccessResponse(output: WebhookHandlerReturn): Response {
  if (typeof Response !== "undefined" && output instanceof Response) {
    return output;
  }

  if (output === undefined) {
    return createJsonResponse(DEFAULT_SUCCESS_BODY, 200);
  }

  return createJsonResponse(JSON.stringify(output), 200);
}

/**
 * Produces an error `Response` via `options.onError` if configured, or the default JSON responder.
 *
 * @param error - `WebhookKitError` instance.
 * @param meta - Error metadata including context, request, rawBody, and timestamp.
 * @param onError - Optional user-supplied error callback.
 * @returns Error `Response`.
 */
async function handleVerificationFailure<TContext extends WebhookRequestInput>(
  error: WebhookKitError,
  meta: WebhookErrorMeta<TContext>,
  onError?: WebhookHandlerOptions<unknown, TContext>["onError"],
): Promise<Response> {
  if (onError) {
    return onError(error, meta);
  }

  return createErrorResponse(error);
}

/**
 * Resolves the secret and executes `verifyWebhookSignature`, catching `WebhookKitError` exceptions.
 *
 * @param options - Handler configuration options.
 * @param context - Handler input context.
 * @param request - Unwrapped Web Standard `Request`.
 * @returns Discriminated verification outcome for handler dispatch.
 */
async function verifyRequest<TPayload, TContext extends WebhookRequestInput>(
  options: WebhookHandlerOptions<TPayload, TContext>,
  context: TContext,
  request: Request,
): Promise<
  | { ok: true; result: WebhookVerificationSuccess<TPayload> }
  | {
      ok: false;
      error: WebhookKitError;
      rawBody?: string;
      timestamp?: number;
    }
> {
  try {
    const secret = await resolveSecret(options.secret, context, request);
    const result = await verifyWebhookSignature<TPayload>({
      body: request,
      secret,
      provider: options.provider,
      algorithm: options.algorithm,
      encoding: options.encoding,
      toleranceSeconds: options.toleranceSeconds,
      currentTimestamp: options.currentTimestamp,
      parseJson: options.parseJson,
    });

    if (!result.valid) {
      return {
        ok: false,
        error: result.error,
        rawBody: result.rawBody,
        timestamp: result.timestamp,
      };
    }

    return { ok: true, result };
  } catch (err) {
    // WHY: `extractRawBody` throws `PayloadExtractionError` when a Request stream
    // was already consumed prior to reaching the handler; convert it into a structured failure.
    if (err instanceof WebhookKitError) {
      return { ok: false, error: err };
    }

    throw err;
  }
}

/**
 * Creates a universal Stripe webhook route handler for Next.js App Router, Hono, and WinterCG runtimes.
 */
export function createWebhookHandler<
  TPayload = StripeWebhookEvent,
  TContext extends WebhookRequestInput = Request,
>(
  options: WebhookHandlerOptions<TPayload, TContext> & { provider: "stripe" },
): UniversalWebhookHandler<TContext>;

/**
 * Creates a universal GitHub webhook route handler for Next.js App Router, Hono, and WinterCG runtimes.
 */
export function createWebhookHandler<
  TPayload = GithubWebhookEvent,
  TContext extends WebhookRequestInput = Request,
>(
  options: WebhookHandlerOptions<TPayload, TContext> & { provider: "github" },
): UniversalWebhookHandler<TContext>;

/**
 * Creates a universal Shopify webhook route handler for Next.js App Router, Hono, and WinterCG runtimes.
 */
export function createWebhookHandler<
  TPayload = ShopifyWebhookEvent,
  TContext extends WebhookRequestInput = Request,
>(
  options: WebhookHandlerOptions<TPayload, TContext> & { provider: "shopify" },
): UniversalWebhookHandler<TContext>;

/**
 * Creates a universal webhook route handler using a custom `WebhookProviderPlugin`.
 */
export function createWebhookHandler<
  TPayload,
  TContext extends WebhookRequestInput = Request,
>(
  options: WebhookHandlerOptions<TPayload, TContext> & {
    provider: WebhookProviderPlugin<TPayload, never>;
  },
): UniversalWebhookHandler<TContext>;

/**
 * Creates a universal webhook route handler that unwraps a Web Standard `Request` (Next.js App Router,
 * Cloudflare Workers, Remix, Bun, Deno) or `{ req: { raw: Request } }` context (Hono), verifies the
 * cryptographic signature, and dispatches the typed payload to `onEvent`.
 *
 * @param options - Provider, secret resolver, event handler, and optional verification settings.
 * @returns Universal async route handler `(input: TContext) => Promise<Response>`.
 */
export function createWebhookHandler<
  TPayload = unknown,
  TContext extends WebhookRequestInput = Request,
>(
  options: WebhookHandlerOptions<TPayload, TContext>,
): UniversalWebhookHandler<TContext>;

export function createWebhookHandler<
  TPayload = unknown,
  TContext extends WebhookRequestInput = Request,
>(
  options: WebhookHandlerOptions<TPayload, TContext>,
): UniversalWebhookHandler<TContext> {
  return async (input: TContext): Promise<Response> => {
    const request = unwrapRequest(input);

    if (!request) {
      const extractionError = new PayloadExtractionError(
        "Invalid webhook handler input: expected Web Standard Request or context with { req: { raw: Request } }",
      );

      return createErrorResponse(extractionError);
    }

    const outcome = await verifyRequest(options, input, request);

    if (!outcome.ok) {
      return handleVerificationFailure(
        outcome.error,
        {
          context: input,
          request,
          rawBody: outcome.rawBody,
          timestamp: outcome.timestamp,
        },
        options.onError,
      );
    }

    // WHY: Do not wrap `onEvent` in try/catch so unhandled application errors
    // propagate naturally as 500s rather than being misreported as 401/400 verification errors.
    const output = await options.onEvent(outcome.result.payload, {
      context: input,
      request,
      rawBody: outcome.result.rawBody,
      timestamp: outcome.result.timestamp,
    });

    return formatSuccessResponse(output);
  };
}
