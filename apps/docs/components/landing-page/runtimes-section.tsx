import { CheckCircle2 } from "lucide-react"
import { RUNTIMES } from "@/constants/runtimes"

export function RuntimesSection() {
  return (
    <section
      id="runtimes"
      aria-labelledby="runtimes-heading"
      className="border-b border-border/60 py-14 sm:py-20"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Supported Runtimes
          </p>
          <h2
            id="runtimes-heading"
            className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          >
            Write once, verify on every JavaScript runtime
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Zero{" "}
            <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              node:crypto
            </code>{" "}
            or{" "}
            <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              Buffer
            </code>{" "}
            imports. Runs unmodified in serverless and edge isolates.
          </p>
        </div>

        <div className="mt-8 overflow-hidden rounded-xl border border-border/80 bg-card/50">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border/80 bg-muted/50 font-mono text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Runtime</th>
                  <th className="px-4 py-3 font-medium">Support</th>
                  <th className="px-4 py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {RUNTIMES.map((runtime) => (
                  <tr key={runtime.name} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {runtime.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="size-3.5 shrink-0 text-muted-foreground" />
                        <span>{runtime.support}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {runtime.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
