import { CodeBlock } from "@/components/code/code-block"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RECIPES } from "@/constants/recipes"

export function RecipesSection() {
  return (
    <section
      id="recipes"
      aria-labelledby="recipes-heading"
      className="border-b border-border/60 py-14 sm:py-20"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Framework Recipes & Live Snippets
          </p>
          <h2
            id="recipes-heading"
            className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          >
            Automatic Stream-Cloning & Universal Handlers
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Every Web Standard Request is automatically cloned with{" "}
            <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              request.clone()
            </code>
            . Your original request stream remains unconsumed (
            <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              bodyUsed: false
            </code>
            ), safe for downstream JSON parsing, logging, proxy forwarding, or
            queues across Next.js, Hono, and Cloudflare Workers.
          </p>
        </div>

        <div className="mt-8">
          <Tabs defaultValue={RECIPES[0].id}>
            <TabsList
              aria-label="Framework recipes"
              className="max-w-full overflow-x-auto"
            >
              {RECIPES.map((recipe) => (
                <TabsTrigger key={recipe.id} value={recipe.id}>
                  {recipe.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {RECIPES.map((recipe) => (
              <TabsContent key={recipe.id} value={recipe.id}>
                <CodeBlock
                  code={recipe.code}
                  filename={recipe.filename}
                  badge="Zero Stream Lock"
                  badgeVariant="success"
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </section>
  )
}
