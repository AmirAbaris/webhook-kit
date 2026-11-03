import { SITE } from "@/constants/site"

export function SiteFooter() {
  return (
    <footer className="border-t border-border/80 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-4 px-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:px-6">
        <p>
          <span className="font-mono font-semibold text-foreground">
            {SITE.name}
          </span>{" "}
          · Released under the MIT License.
        </p>
        <div className="flex items-center gap-4">
          <a
            href={SITE.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            GitHub
          </a>
          <a
            href={SITE.npmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            npm
          </a>
          <span className="font-mono text-[11px]">
            Press <kbd className="rounded-xs border px-1 py-0.5">d</kbd> to
            toggle theme
          </span>
        </div>
      </div>
    </footer>
  )
}
