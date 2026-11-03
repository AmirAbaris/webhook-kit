"use client"

import * as React from "react"
import {
  CheckCircle2,
  FlaskConical,
  KeyRound,
  RotateCcw,
  XCircle,
} from "lucide-react"
import {
  computeSubtleHmac,
  verifyWebhookSignature,
  type WebhookVerificationResult,
} from "webhook-kit"
import { Button } from "@/components/ui/button"

const DEFAULT_SECRET = "whsec_live_demo_secret_key_9f8a7b"

const DEFAULT_PAYLOAD = `{
  "id": "evt_1P9xYz2eZvKYlo2C0a1b2c3d",
  "type": "checkout.session.completed",
  "data": {
    "amount_total": 4900,
    "currency": "usd"
  }
}`

type PlaygroundState =
  | { status: "computing" }
  | { status: "invalid-json"; message: string }
  | {
      status: "ready"
      signature: string
      reparsedBody: string
      rawResult: WebhookVerificationResult
      reparsedResult: WebhookVerificationResult
    }

export function PlaygroundSection() {
  const [secret, setSecret] = React.useState(DEFAULT_SECRET)
  const [payload, setPayload] = React.useState(DEFAULT_PAYLOAD)
  const [state, setState] = React.useState<PlaygroundState>({
    status: "computing",
  })

  React.useEffect(() => {
    let cancelled = false

    async function evaluate() {
      let reparsedBody: string
      try {
        const parsed: unknown = JSON.parse(payload)
        reparsedBody = JSON.stringify(parsed)
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "invalid-json",
            message:
              err instanceof Error ? err.message : "Payload is not valid JSON.",
          })
        }
        return
      }

      try {
        const signature = await computeSubtleHmac(
          "SHA-256",
          secret,
          payload,
          "hex"
        )
        const [rawResult, reparsedResult] = await Promise.all([
          verifyWebhookSignature({
            body: payload,
            signature,
            secret,
            parseJson: false,
          }),
          verifyWebhookSignature({
            body: reparsedBody,
            signature,
            secret,
            parseJson: false,
          }),
        ])

        if (!cancelled) {
          setState({
            status: "ready",
            signature,
            reparsedBody,
            rawResult,
            reparsedResult,
          })
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "invalid-json",
            message:
              err instanceof Error
                ? err.message
                : "Web Cryptography evaluation failed.",
          })
        }
      }
    }

    void evaluate()

    return () => {
      cancelled = true
    }
  }, [payload, secret])

  function handleReset() {
    setSecret(DEFAULT_SECRET)
    setPayload(DEFAULT_PAYLOAD)
  }

  return (
    <section
      id="playground"
      aria-labelledby="playground-heading"
      className="border-b border-border/60 py-14 sm:py-20"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wider text-primary uppercase">
              <FlaskConical className="size-3.5" />
              <span>Live Browser Playground (crypto.subtle)</span>
            </div>
            <h2
              id="playground-heading"
              className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
            >
              See why JSON re-serialization breaks HMAC in real time
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Powered directly by{" "}
              <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                webhook-kit
              </code>{" "}
              running in your browser via{" "}
              <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                globalThis.crypto.subtle
              </code>
              . Edit the raw JSON or secret below.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
          >
            <RotateCcw className="size-3.5" />
            <span>Reset Preset</span>
          </Button>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-4 rounded-xl border border-border/80 bg-card/60 p-4 sm:p-5 lg:col-span-6">
            <div>
              <label
                htmlFor="playground-secret"
                className="flex items-center gap-1.5 font-mono text-xs font-medium text-foreground"
              >
                <KeyRound className="size-3.5 text-primary" />
                <span>Signing Secret</span>
              </label>
              <input
                id="playground-secret"
                type="text"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                spellCheck={false}
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </div>

            <div className="flex flex-1 flex-col">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="playground-payload"
                  className="font-mono text-xs font-medium text-foreground"
                >
                  Sender Raw JSON Payload (Signed Bytes)
                </label>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {new TextEncoder().encode(payload).length} bytes
                </span>
              </div>
              <textarea
                id="playground-payload"
                rows={8}
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                spellCheck={false}
                className="mt-1.5 w-full flex-1 rounded-md border border-input bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:col-span-6">
            {state.status === "computing" ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-border/80 bg-card/40 p-6 font-mono text-xs text-muted-foreground">
                Computing HMAC-SHA256 digest...
              </div>
            ) : null}

            {state.status === "invalid-json" ? (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-5 text-xs text-red-400">
                <p className="font-semibold">Invalid JSON Input</p>
                <p className="mt-1 font-mono">{state.message}</p>
              </div>
            ) : null}

            {state.status === "ready" ? (
              <>
                <div className="rounded-xl border border-border/80 bg-card/60 p-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-medium text-muted-foreground">
                      Sender Header (X-Webhook-Signature · SHA-256 hex)
                    </span>
                  </div>
                  <p
                    data-testid="playground-signature"
                    className="mt-1.5 font-mono text-xs break-all text-primary"
                  >
                    {state.signature}
                  </p>
                </div>

                <VerificationCard
                  testId="playground-raw-result"
                  title="1. Raw Body Verification (verifyWebhookSignature({ body: raw }))"
                  subtitle={`Verified exact ${new TextEncoder().encode(payload).length}-byte payload sent over the wire.`}
                  result={state.rawResult}
                />

                <VerificationCard
                  testId="playground-reparsed-result"
                  title="2. Re-serialized JSON (verifyWebhookSignature({ body: JSON.stringify(await req.json()) }))"
                  subtitle={`Re-stringified to ${new TextEncoder().encode(state.reparsedBody).length} bytes — whitespace stripped, HMAC mismatch.`}
                  result={state.reparsedResult}
                />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}

function VerificationCard({
  testId,
  title,
  subtitle,
  result,
}: {
  testId: string
  title: string
  subtitle: string
  result: WebhookVerificationResult
}) {
  return (
    <div
      data-testid={testId}
      className={
        result.valid
          ? "rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4"
          : "rounded-xl border border-red-500/40 bg-red-500/10 p-4"
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {result.valid ? (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-500 dark:text-emerald-400" />
          ) : (
            <XCircle className="size-4 shrink-0 text-red-500 dark:text-red-400" />
          )}
          <h3 className="font-mono text-xs font-semibold text-foreground">
            {title}
          </h3>
        </div>
        <span
          className={
            result.valid
              ? "shrink-0 rounded-sm bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-300"
              : "shrink-0 rounded-sm bg-red-500/20 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-red-600 dark:text-red-300"
          }
        >
          {result.valid ? "valid: true" : "valid: false"}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{subtitle}</p>
      {!result.valid ? (
        <p className="mt-2 rounded-md bg-zinc-950/80 px-2.5 py-1.5 font-mono text-[11px] text-red-300">
          {result.error.name}: {result.error.message}
        </p>
      ) : null}
    </div>
  )
}
