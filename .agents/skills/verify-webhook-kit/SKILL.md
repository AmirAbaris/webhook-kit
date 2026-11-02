---
name: verify-webhook-kit
description: "Verify webhook-kit library, dual packaging (ESM/CJS), zero-dependency tarball sandbox, type narrowing, and CLI agent-rules injection."
---

# Verify webhook-kit

Use this skill to verify `webhook-kit` from a user's perspective across its dual package distribution, TypeScript typings, zero-dependency guarantees, and CLI developer tooling.

## 1. Surface

`webhook-kit` has two primary user surfaces:
1. **The Library Package**: Dual ESM (`dist/index.mjs`) and CommonJS (`dist/index.js`) exports consumed in Node, Bun, Deno, and Edge environments.
2. **The Developer CLI**: Zero-dependency binary (`bin/webhook-kit.mjs` or `npx webhook-kit init-agent`).

## 2. Launch & Build

Before driving verification, compile the distribution artifacts and type declarations:

```bash
pnpm build
```

Verify ready state:
- Check that `dist/index.mjs`, `dist/index.js`, and `dist/index.d.ts` exist.

## 3. Doctor

Run this quick check to confirm the environment, dependencies, AST lint rules, statement spacing, and full test-suite types are healthy:

```bash
node -v && pnpm -v && pnpm lint
```
- Node must be >= 22.0.0
- `oxlint` (correctness & cyclomatic complexity ≤ 7), `eslint` (`@stylistic/padding-line-between-statements`, `no-restricted-imports` for `node:crypto`), Prettier formatting, and strict TypeScript typechecking across `src/`, `tests/`, and `tests-d/` (`tsconfig.lint.json`) must all pass with exit code 0.

## 4. Drive & Evidence

Execute the end-to-end verification harness across 4 key dimensions:

### A. Zero-Dependency Tarball Sandbox Verification
Verify that packing the project into a `.tgz` tarball and installing it into a fresh, isolated temporary consumer project installs **only** `webhook-kit` and no phantom dependencies:

```bash
pnpm test:smoke
```

**Evidence to Observe:**
- Tarball packed into temporary sandbox directory.
- `node_modules` contains exactly 1 package (`webhook-kit`).
- ESM exports imported and confirmed.
- Sandbox cleanly removed.

### B. Unit & Provider Specification Tests
Run the test runner to verify behavior specifications:

```bash
pnpm test
```

### C. Compile-Time Type Narrowing
Run `tsd` to verify TypeScript generics and payload type-narrowing:

```bash
pnpm test:types
```

### D. CLI Rule Injection Driving
Verify that the `webhook-kit init-agent` CLI safely injects rules into agent files:

```bash
node ./bin/webhook-kit.mjs init-agent --target /tmp/test-verify-agent.md
grep "webhook-kit-agent-rules:start" /tmp/test-verify-agent.md
rm /tmp/test-verify-agent.md
```

## 5. Cleanup

After running verification:
- Temporary smoke directories are automatically removed by `tests/package-smoke.mjs`.
- Remove any temporary test files in `/tmp`.
