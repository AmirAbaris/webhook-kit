import {
  PayloadExtractionError,
  ReplayAttackError,
  WebhookKitError,
} from "../errors.js";
import type { GithubWebhookEvent } from "../providers/github/types.js";
import type { ShopifyWebhookEvent } from "../providers/shopify/types.js";
import type { StripeWebhookEvent } from "../providers/stripe/types.js";
import type {
  WebhookProviderPlugin,
  WebhookReplayStore,
  WebhookVerificationSuccess,
} from "../types.js";
import { verifyWebhookSignature } from "../verify.js";
import type {
  ReplayStoreResolver,
  SecretResolver,
  UniversalWebhookHandler,
  WebhookErrorMeta,
  WebhookHandlerOptions,
  WebhookHandlerReturn,
  WebhookRequestInput,
} from "./types.js";

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

const DEFAULT_SUCCESS_BODY = JSON.stringify({ received: true });

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
 * Resolves the appropriate HTTP status code for a `WebhookKitError`.
 *
 * @param error - Verification, replay, or extraction error.
 * @returns `400` for extraction errors, `409` for duplicate event replays, or `401` for verification errors.
 */
function resolveErrorStatus(error: WebhookKitError): number {
  if (error instanceof PayloadExtractionError) {
    return 400;
  }

  if (error instanceof ReplayAttackError) {
    return 409;
  }

  return 401;
}

/**
 * Converts a `WebhookKitError` into a structured JSON HTTP error `Response`.
 *
 * @param error - Verification or extraction error.
 * @returns `400`, `409`, or `401` JSON error response.
 */
function createErrorResponse(error: WebhookKitError): Response {
  // WHY: Map stream/body extraction failures to 400 Bad Request, duplicate replay
  // detections to 409 Conflict, and cryptographic/header failures to 401 Unauthorized.
  const status = resolveErrorStatus(error);

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
 * Resolves the replay store from a static store object or dynamic resolver function.
 *
 * @param store - Static replay store or resolver function.
 * @param context - Original handler input (`Request` or framework context).
 * @param request - Unwrapped Web Standard `Request`.
 * @returns Resolved `WebhookReplayStore` or `undefined`.
 */
async function resolveStore<TContext extends WebhookRequestInput>(
  store: ReplayStoreResolver<TContext> | undefined,
  context: TContext,
  request: Request,
): Promise<WebhookReplayStore | undefined> {
  if (typeof store === "function") {
    return store(context, request);
  }

  return store;
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
      eventId?: string;
    }
> {
  try {
    const secret = await resolveSecret(options.secret, context, request);
    const store = await resolveStore(options.store, context, request);
    const result = await verifyWebhookSignature<TPayload>({
      body: request,
      secret,
      provider: options.provider,
      algorithm: options.algorithm,
      encoding: options.encoding,
      toleranceSeconds: options.toleranceSeconds,
      currentTimestamp: options.currentTimestamp,
      store,
      eventId: options.eventId,
      storeTtlSeconds: options.storeTtlSeconds,
      parseJson: options.parseJson,
    });

    if (!result.valid) {
      return {
        ok: false,
        error: result.error,
        rawBody: result.rawBody,
        timestamp: result.timestamp,
        eventId: result.eventId,
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
          eventId: outcome.eventId,
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
      eventId: outcome.result.eventId,
    });

    return formatSuccessResponse(output);
  };
}
