import { CodeBlock } from "@/components/code/code-block"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PACKAGE_MANAGERS } from "@/constants/install"

export function InstallSection() {
  return (
    <section
      id="install"
      aria-labelledby="install-heading"
      className="border-b border-border/60 py-14 sm:py-16"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-md">
            <p className="font-mono text-xs font-semibold tracking-wider text-primary uppercase">
              Installation
            </p>
            <h2
              id="install-heading"
              className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl"
            >
              Drop-in ESM &amp; CJS package with zero dependencies
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Install with your preferred package manager. Includes strict
              TypeScript declarations and the{" "}
              <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                webhook-kit
              </code>{" "}
              CLI.
            </p>
          </div>

          <div className="w-full min-w-0 md:max-w-md">
            <Tabs defaultValue={PACKAGE_MANAGERS[0].id}>
              <TabsList aria-label="Package managers">
                {PACKAGE_MANAGERS.map((pm) => (
                  <TabsTrigger key={pm.id} value={pm.id}>
                    {pm.id}
                  </TabsTrigger>
                ))}
              </TabsList>
              {PACKAGE_MANAGERS.map((pm) => (
                <TabsContent key={pm.id} value={pm.id}>
                  <CodeBlock
                    code={pm.command}
                    language="bash"
                    filename={`terminal (${pm.id})`}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </div>
      </div>
    </section>
  )
}
