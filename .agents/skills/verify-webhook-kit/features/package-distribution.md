# Feature: Package Distribution & Zero-Dependency Sandbox

## Sub-features
- Dual ESM and CJS bundle emission with source and declaration maps.
- Isolated sandbox npm tarball packaging with 0 runtime dependencies.
- Node.js ESM import verification from consumer perspective.

## How to get to it (user POV)
A consumer runs `npm install webhook-kit` (or `pnpm add webhook-kit`) and imports functions in their ESM or CommonJS server.

## Driving it with test:smoke
Run:
```bash
pnpm test:smoke
```

## Gotchas
- Must ensure `pnpm build` was run before packing so `dist/` contains latest artifacts.
- Tarball must not contain dev files, tests, or test artifacts (enforced by `files` field in `package.json`).
