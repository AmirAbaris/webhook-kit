import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { CodeBlock } from "@/components/code/code-block"
import { PITFALL } from "@/constants/pitfall"

export function PitfallSection() {
  return (
    <section
      id="pitfall"
      aria-labelledby="pitfall-heading"
      className="border-b border-border/60 py-14 sm:py-20"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="max-w-3xl">
          <p className="font-mono text-xs font-semibold tracking-wider text-primary uppercase">
            Why webhooks fail in production
          </p>
          <h2
            id="pitfall-heading"
            className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          >
            {PITFALL.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {PITFALL.subtitle}
          </p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-red-500 dark:text-red-400">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{PITFALL.wrong.label}</span>
            </div>
            <CodeBlock
              code={PITFALL.wrong.code}
              filename={PITFALL.wrong.filename}
              badge={PITFALL.wrong.badge}
              badgeVariant="danger"
              className="flex-1 border-red-500/30"
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>{PITFALL.right.label}</span>
            </div>
            <CodeBlock
              code={PITFALL.right.code}
              filename={PITFALL.right.filename}
              badge={PITFALL.right.badge}
              badgeVariant="success"
              className="flex-1 border-emerald-500/30"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
