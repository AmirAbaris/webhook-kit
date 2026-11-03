import { FEATURES } from "@/constants/features"

export function FeaturesSection() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="border-b border-border/60 py-14 sm:py-20"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="font-mono text-xs font-semibold tracking-wider text-primary uppercase">
            Capabilities
          </p>
          <h2
            id="features-heading"
            className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          >
            Cryptographic rigor without Node.js lock-in
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Every primitive is designed around Web Standard APIs and strict
            TypeScript discriminated unions.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <article
                key={feature.id}
                className="flex flex-col rounded-xl border border-border/80 bg-card/60 p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                  <Icon className="size-4" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  {feature.description}
                </p>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
