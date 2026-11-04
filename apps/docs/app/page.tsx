import Link from "next/link"
import {
  ArrowRight,
  Bot,
  Cpu,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Terminal,
} from "lucide-react"
import { CodeBlock } from "@/components/code/code-block"
import { CopyButton } from "@/components/code/copy-button"
import { Button } from "@/components/ui/button"
import { SiteFooter } from "@/components/landing-page/site-footer"
import { SiteHeader } from "@/components/landing-page/site-header"
import { SITE } from "@/constants/site"

const QUICKSTART_CODE = `import { createWebhookHandler } from "@amirabaris/webhook-kit"

// Declarative route handler with automatic stream-cloning
export const POST = createWebhookHandler({
  provider: "stripe",
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  onEvent: async (event) => {
    // Verified event payload — request stream remains unconsumed
    console.log("Verified event:", event.type)
  },
})`

const HIGHLIGHTS = [
  {
    icon: Bot,
    title: "Agentic Workflow & Guardrails",
    description:
      "CLI command injects rules into AGENTS.md / CLAUDE.md so AI coding assistants never break webhooks by parsing JSON before signature checks.",
  },
  {
    icon: Cpu,
    title: "Pure Web Cryptography",
    description:
      "Powered by crypto.subtle with zero node:crypto or Buffer dependencies. Runs natively on Cloudflare Workers, Next.js Edge, Bun, Deno, and Node.",
  },
  {
    icon: RefreshCw,
    title: "Zero Stream Lock",
    description:
      "Uses request.clone() during verification. Original request body remains unconsumed (bodyUsed: false) for downstream parsers or proxies.",
  },
  {
    icon: ShieldCheck,
    title: "Replay Attack Defense",
    description:
      "Built-in in-memory LRU or pluggable Redis/KV stores stop duplicate event execution when providers retry failed deliveries.",
  },
] as const

export default function HomePage() {
  const installCmd = "npm i @amirabaris/webhook-kit"

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
          {/* Hero */}
          <div className="flex flex-col items-start gap-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-muted/50 px-3 py-1 font-mono text-xs font-medium text-muted-foreground">
              <span>Agent-first</span>
              <span className="text-border">·</span>
              <span>Zero-dependency</span>
              <span className="text-border">·</span>
              <span>Web Crypto</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl sm:leading-[1.15]">
              Zero-dependency, edge-compatible webhook verification
            </h1>

            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Universal webhook signature verification and route handler toolkit
              built for agentic workflows and standard Web Cryptography (
              <code className="font-mono text-xs text-foreground">
                crypto.subtle
              </code>
              ). Never locks incoming request streams and prevents duplicate
              replay attacks across Next.js, Cloudflare Workers, Hono, Node.js,
              Bun, and Deno.
            </p>

            {/* Quick Install & Actions */}
            <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-zinc-950 px-3.5 py-2 font-mono text-xs text-zinc-100 sm:w-80">
                <div className="flex items-center gap-2 truncate">
                  <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{installCmd}</span>
                </div>
                <CopyButton value={installCmd} label="Copy install command" />
              </div>

              <div className="flex items-center gap-2">
                <Button asChild size="lg" className="h-9 px-4 text-xs">
                  <Link href="/docs">
                    <span>Read Documentation</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="h-9 px-4 text-xs"
                >
                  <a
                    href={SITE.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span>GitHub</span>
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </a>
                </Button>
              </div>
            </div>
          </div>

          {/* Quick Teaser */}
          <div className="mt-12">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Quick Example
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                Next.js / Web Standard Route Handler
              </span>
            </div>
            <CodeBlock
              code={QUICKSTART_CODE}
              filename="app/api/webhook/route.ts"
              badge="Zero Stream Lock"
              badgeVariant="success"
            />
          </div>

          {/* Highlights */}
          <div className="mt-14">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Why webhook-kit?
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {HIGHLIGHTS.map((item) => (
                <div
                  key={item.title}
                  className="flex flex-col gap-2 rounded-xl border border-border/80 bg-card/60 p-4"
                >
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <item.icon className="size-4 text-muted-foreground" />
                    <span className="text-xs font-semibold">{item.title}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Documentation CTA */}
          <div className="mt-14 rounded-xl border border-border/80 bg-muted/40 p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Ready to get started?
                </h3>
                <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                  Check out the step-by-step documentation to set up
                  verification in minutes.
                </p>
              </div>
              <Button asChild size="sm" className="h-8 shrink-0 px-3 text-xs">
                <Link href="/docs">
                  <span>Explore Docs</span>
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
