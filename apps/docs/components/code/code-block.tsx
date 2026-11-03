import { Highlight, themes } from "prism-react-renderer"
import { CopyButton } from "@/components/code/copy-button"
import { cn } from "@/lib/utils"

export interface CodeBlockProps {
  code: string
  language?: string
  filename?: string
  badge?: string
  badgeVariant?: "default" | "success" | "danger"
  className?: string
}

export function CodeBlock({
  code,
  language = "tsx",
  filename,
  badge,
  badgeVariant = "default",
  className,
}: CodeBlockProps) {
  const trimmed = code.trim()

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border/80 bg-zinc-950 text-zinc-100 shadow-xs",
        className
      )}
    >
      {filename || badge ? (
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900/70 px-3.5 py-2 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            {filename ? (
              <span className="truncate font-mono text-zinc-300">
                {filename}
              </span>
            ) : null}
            {badge ? (
              <span
                className={cn(
                  "inline-flex items-center rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-medium",
                  badgeVariant === "success" &&
                    "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
                  badgeVariant === "danger" &&
                    "bg-red-500/15 text-red-300 ring-1 ring-red-500/30",
                  badgeVariant === "default" &&
                    "bg-zinc-800 text-zinc-300 ring-1 ring-zinc-700"
                )}
              >
                {badge}
              </span>
            ) : null}
          </div>
          <CopyButton value={trimmed} />
        </div>
      ) : null}
      <div className="relative">
        {!filename && !badge ? (
          <div className="absolute top-2 right-2 z-10">
            <CopyButton value={trimmed} />
          </div>
        ) : null}
        <Highlight code={trimmed} language={language} theme={themes.nightOwl}>
          {({
            className: highlightClass,
            style,
            tokens,
            getLineProps,
            getTokenProps,
          }) => (
            <pre
              className={cn(
                "w-full max-w-full overflow-x-auto p-4 font-mono text-xs leading-relaxed sm:text-[13px]",
                highlightClass
              )}
              style={{ ...style, background: "transparent" }}
            >
              {tokens.map((line, lineIndex) => {
                const lineProps = getLineProps({ line })
                return (
                  <div
                    key={lineIndex}
                    {...lineProps}
                    className={cn(
                      "-mx-2 rounded-xs px-2 whitespace-pre",
                      lineProps.className
                    )}
                  >
                    {line.map((token, tokenIndex) => {
                      const tokenProps = getTokenProps({ token })
                      return <span key={tokenIndex} {...tokenProps} />
                    })}
                  </div>
                )
              })}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  )
}
