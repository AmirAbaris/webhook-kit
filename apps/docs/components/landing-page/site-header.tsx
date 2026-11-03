"use client"

import { ExternalLink, Moon, ShieldCheck, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { SITE } from "@/constants/site"

export function SiteHeader() {
  const { resolvedTheme, setTheme } = useTheme()

  function toggleTheme() {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <a
          href="#top"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <span className="flex size-7 items-center justify-center rounded-md border border-border bg-muted/60 text-foreground">
            <ShieldCheck className="size-4" />
          </span>
          <span>{SITE.name}</span>
          <span className="hidden rounded-sm border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-block">
            v0.1.0
          </span>
        </a>

        <nav
          aria-label="Primary navigation"
          className="flex items-center gap-1.5 sm:gap-2"
        >
          <a
            href="#playground"
            className="hidden rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Playground
          </a>
          <a
            href="#recipes"
            className="hidden rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Recipes
          </a>
          <Button asChild variant="outline" size="sm">
            <a
              href={SITE.npmUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="webhook-kit on npm"
            >
              <span>npm</span>
              <ExternalLink className="size-3 text-muted-foreground" />
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a
              href={SITE.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="webhook-kit on GitHub"
            >
              <span>GitHub</span>
              <ExternalLink className="size-3 text-muted-foreground" />
            </a>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle color theme"
          >
            <Sun className="size-4 scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" />
            <Moon className="absolute size-4 scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0" />
          </Button>
        </nav>
      </div>
    </header>
  )
}
