import type { WebhookKitError } from "../errors.js";
import type {
  BuiltinProviderName,
  SupportedAlgorithm,
  WebhookProviderPlugin,
  WebhookReplayStore,
} from "../types.js";

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
 * Static replay store instance or dynamic store resolver function.
 */
export type ReplayStoreResolver<TContext = Request> =
  | WebhookReplayStore
  | ((
      context: TContext,
      request: Request,
    ) =>
      WebhookReplayStore | undefined | Promise<WebhookReplayStore | undefined>);

/**
 * Metadata passed as the second argument to `onEvent` alongside the verified payload.
 */
export interface WebhookEventMeta<TContext = Request> {
  readonly context: TContext;
  readonly request: Request;
  readonly rawBody: string;
  readonly timestamp?: number;
  readonly eventId?: string;
}

/**
 * Metadata passed as the second argument to `onError` when verification fails.
 */
export interface WebhookErrorMeta<TContext = Request> {
  readonly context: TContext;
  readonly request: Request;
  readonly rawBody?: string;
  readonly timestamp?: number;
  readonly eventId?: string;
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
   * Optional idempotency / replay store (`has(eventId)` / `set(eventId, ttl)`) or dynamic resolver function.
   */
  store?: ReplayStoreResolver<TContext>;

  /**
   * Optional explicit webhook event ID for idempotency / replay store tracking.
   */
  eventId?: string;

  /**
   * Optional TTL in seconds for entries recorded in `store` (defaults to `toleranceSeconds` or `300`).
   */
  storeTtlSeconds?: number;

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
