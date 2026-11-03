# webhook-kit-docs

Documentation and interactive landing page for [`webhook-kit`](../../README.md), built with Next.js 16, React 19, Tailwind CSS v4, shadcn/ui, and `prism-react-renderer`.

## Workspace Architecture

- **Local library linking (`"@amirabaris/webhook-kit": "workspace:*"`)**: The site imports `verifyWebhookSignature` and `computeSubtleHmac` directly from the local workspace package so the interactive browser playground always runs against the current library build.
- **Root-first build (`pnpm --workspace-root run build && next build`)**: Running `pnpm build` inside `apps/docs` bundles the root `webhook-kit` library via `tsdown` before running `next build`.
- **Single source of truth for agent rules**: [`agent-rules.md`](./agent-rules.md) is a relative symlink to [`../../docs/agent-rules.md`](../../docs/agent-rules.md), which is also packaged with `webhook-kit` and injected by `npx @amirabaris/webhook-kit init-agent`.

## Development

From the repository root:

```bash
# Start the Next.js development server
pnpm --filter webhook-kit-docs dev

# Run ESLint and TypeScript checks
pnpm --filter webhook-kit-docs lint
pnpm --filter webhook-kit-docs typecheck

# Build root library + Next.js production bundle
pnpm --filter webhook-kit-docs build
```

## Adding shadcn/ui Components

```bash
pnpm --filter webhook-kit-docs shadcn:add <component>
```
