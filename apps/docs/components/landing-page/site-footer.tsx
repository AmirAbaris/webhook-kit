import Link from "next/link"
import { SITE } from "@/constants/site"

export function SiteFooter() {
  return (
    <footer className="border-t border-border/80 py-8">
      <div className="mx-auto flex max-w-3xl flex-col items-start justify-between gap-4 px-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:px-6">
        <p>
          <span className="font-mono font-semibold text-foreground">
            {SITE.name}
          </span>{" "}
          · MIT License.
        </p>
        <div className="flex items-center gap-4">
          <Link
            href="/docs"
            className="transition-colors hover:text-foreground"
          >
            Docs
          </Link>
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
        </div>
      </div>
    </footer>
  )
}
