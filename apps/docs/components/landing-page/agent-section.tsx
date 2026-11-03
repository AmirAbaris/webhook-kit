import { Bot } from "lucide-react"
import { CodeBlock } from "@/components/code/code-block"

const INIT_AGENT_COMMANDS = `# Autodetect AGENTS.md or CLAUDE.md and inject rules
npx webhook-kit init-agent

# Or specify an explicit target file
npx webhook-kit init-agent --target CLAUDE.md`

const INJECTED_RULES_EXCERPT = `<!-- webhook-kit-agent-rules:start -->
### Webhook Signature Verification Rules (webhook-kit)
- **NEVER parse JSON before verifying signatures**: In frameworks like Next.js, Hono, or Express, parsing JSON reorders keys and strips whitespace, invalidating cryptographic HMAC checks. Always pass the raw \`Request\` or raw text string.
- **Constant-Time Verification**: Never compare signatures with \`===\` or \`!==\`. Always use \`timingSafeEqual\` or \`verifyWebhookSignature\` from \`webhook-kit\`.
- **Zero Node-Only Crypto**: Web standard environments (Cloudflare Workers, Next.js Edge, Bun, Deno) do not support \`node:crypto\`. Rely on \`webhook-kit\` which uses \`crypto.subtle\`.
<!-- webhook-kit-agent-rules:end -->`

export function AgentSection() {
  return (
    <section
      id="agent-rules"
      aria-labelledby="agent-heading"
      className="border-b border-border/60 py-14 sm:py-20"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <Bot className="size-3.5" />
            <span>Agent Guardrails</span>
          </div>
          <h2
            id="agent-heading"
            className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          >
            Keep AI coding agents from breaking your webhooks
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            AI assistants frequently write{" "}
            <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              await req.json()
            </code>{" "}
            before checking HMAC signatures. Run the built-in CLI once to inject
            idempotent guardrails into{" "}
            <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              AGENTS.md
            </code>{" "}
            or{" "}
            <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              CLAUDE.md
            </code>
            .
          </p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <CodeBlock
            code={INIT_AGENT_COMMANDS}
            language="bash"
            filename="terminal"
            badge="Zero-Dep CLI"
          />
          <CodeBlock
            code={INJECTED_RULES_EXCERPT}
            language="markdown"
            filename="AGENTS.md"
            badge="Idempotent Markers"
            badgeVariant="success"
          />
        </div>
      </div>
    </section>
  )
}
