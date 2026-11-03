import { ArrowRight, Terminal } from "lucide-react"
import { CopyButton } from "@/components/code/copy-button"
import { Button } from "@/components/ui/button"
import { PACKAGE_MANAGERS } from "@/constants/install"
import { SITE } from "@/constants/site"

export function HeroSection() {
  const defaultCommand = PACKAGE_MANAGERS[0].command

  return (
    <section
      id="top"
      aria-labelledby="hero-heading"
      className="relative overflow-hidden border-b border-border/60 py-16 sm:py-24"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-border/80 bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
          <span
            className="size-1.5 rounded-full bg-emerald-500"
            aria-hidden="true"
          />
          <span className="text-foreground">Zero dependencies</span>
          <span className="text-border" aria-hidden="true">
            ·
          </span>
          <span>
            Web Crypto (
            <code className="font-mono text-[11px] text-foreground/80">
              crypto.subtle
            </code>
            )
          </span>
          <span className="text-border" aria-hidden="true">
            ·
          </span>
          <span className="text-foreground">Stream-Cloning</span>
          <span className="text-border" aria-hidden="true">
            ·
          </span>
          <span>Replay Attack Store</span>
        </div>

        <h1
          id="hero-heading"
          className="mt-6 max-w-3xl text-3xl font-bold tracking-tight text-foreground sm:text-5xl sm:leading-[1.12]"
        >
          {SITE.tagline}
        </h1>

        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          {SITE.description}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-zinc-950 px-3.5 py-2 font-mono text-xs text-zinc-100 sm:min-w-72">
            <div className="flex items-center gap-2 truncate">
              <Terminal className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{defaultCommand}</span>
            </div>
            <CopyButton value={defaultCommand} label="Copy install command" />
          </div>

          <div className="flex items-center gap-2.5">
            <Button asChild size="lg" className="h-10 px-4 text-xs">
              <a href="#playground">
                <span>Try Live Playground</span>
                <ArrowRight className="size-3.5" />
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-10 px-4 text-xs"
            >
              <a
                href={SITE.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>View on GitHub</span>
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
