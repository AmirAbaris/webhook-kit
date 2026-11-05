# Feature: Package Distribution & Zero-Dependency Sandbox

## Sub-features
- Dual ESM (`dist/index.mjs`) and CommonJS (`dist/index.cjs` / `dist/index.js`) bundle emission with declaration maps (`.d.ts`, `.d.mts`, `.d.cts`).
- Isolated sandbox npm tarball packaging with 0 runtime dependencies.
- Node.js ESM import and CommonJS require verification from consumer perspective.

## How to get to it (user POV)
A consumer runs `npm install @amirabaris/webhook-kit` (or `pnpm add @amirabaris/webhook-kit`) and imports functions in their ESM or CommonJS server.

## Driving it with test:smoke
Run:
```bash
pnpm test:smoke
```

## Gotchas
- Must ensure `pnpm build` was run before packing so `dist/` contains latest artifacts.
- Tarball must not contain dev files, tests, or test artifacts (enforced by `files` field in `package.json`).
