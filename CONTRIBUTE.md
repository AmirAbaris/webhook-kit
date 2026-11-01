# Contributing to `webhook-kit`

Thank you for your interest in contributing to `webhook-kit`! We are building a zero-dependency, edge-compatible webhook signature verification toolkit powered by the Web Cryptography API (`crypto.subtle`).

Please review the following standards and workflow to make your contribution process fast and seamless.

---

## 1. Development Principles

1. **Zero Runtime Dependencies**: Every feature must run without third-party production dependencies.
2. **Universal Runtime Support**: Must work seamlessly across Node.js 18+, Bun, Deno, Cloudflare Workers, and Next.js Edge.
3. **Web Standards First**: Always use `crypto.subtle`, Web Standard `Request`, `Uint8Array`, and `TextDecoder`. Do not use `node:crypto` in universal code.
4. **Constant-Time Verification**: All cryptographic comparisons must be timing-safe to eliminate side-channel vulnerabilities.

---

## 2. Branch Naming Conventions

Prefix your branch name with one of the following categories, followed by a short descriptive kebab-case slug:

- `feat/<topic>`: A new feature or provider implementation (e.g., `feat/stripe-provider`, `feat/raw-stream-reader`)
- `fix/<topic>`: A bug fix (e.g., `fix/timing-mismatch-length`, `fix/headers-case-insensitivity`)
- `docs/<topic>`: Documentation updates or guides (e.g., `docs/nextjs-app-router-example`)
- `test/<topic>`: Adding or enhancing tests (e.g., `test/shopify-tamper-cases`)
- `refactor/<topic>`: Code refactoring without behavioral changes (e.g., `refactor/clean-subtle-helpers`)
- `chore/<topic>`: Tooling, dependency, or configuration updates (e.g., `chore/bump-tsdown`)

---

## 3. Commit Message Rules & Conventions

We strictly follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. Automated changelogs and release notes depend on this format.

### Commit Format

```text
type(scope): brief description in imperative mood
```

### Permitted Types

- `feat`: A new feature or provider (e.g., `feat(stripe): add tolerance check support`)
- `fix`: A bug fix (e.g., `fix(crypto): timing-safe comparison on mismatched lengths`)
- `docs`: Documentation only changes (e.g., `docs: clarify raw body stream extraction`)
- `test`: Adding or correcting tests (e.g., `test(github): add payload tampering test case`)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `chore`: Maintenance, tooling, and release updates (e.g., `chore: update build configs`)

### Strict Rules

1. **Lowercase Only**: Always use lowercase for the commit `type` and `scope` (e.g., `feat(shopify): ...` not `Feat(Shopify): ...`).
2. **Imperative Mood**: Write the description as an imperative command (e.g., `add tolerance check support`, never `added` or `adds`).
3. **No Trailing Period**: Do NOT put a period at the end of the commit subject line.
4. **Atomic Commits**: Keep commits atomic (one logical change per commit). Do not lump unrelated refactors into a feature commit.

---

## 4. Local Development & Verification Workflow

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 9.0.0 (or npm / corepack)

### Setup

```bash
# Clone the repository
git clone https://github.com/AmirAbaris/webook-kit.git
cd webook-kit

# Install dependencies
pnpm install
```

### Verification Commands

Before opening a pull request, run the following verification checks:

```bash
# 1. Check code formatting & TypeScript types
pnpm lint

# 2. Automatically format code
pnpm format

# 3. Build dual distribution bundles (ESM/CJS and type declarations)
pnpm build

# 4. Run unit and integration tests
pnpm test

# 5. Run compile-time TypeScript type tests
pnpm test:types

# 6. Run isolated package smoke test (builds tarball & tests zero-dependency install)
pnpm test:smoke
```

---

## 5. Pull Request Guidelines

1. **Keep PRs Focused**: Address one problem or feature per PR.
2. **Include Tests**: Add unit tests in `tests/` and type tests in `tests-d/` whenever adding public API types or options.
3. **Document Changes**: If introducing a new provider plugin or changing options, update `README.md` and `docs/agent-rules.md`.
4. **Checklist**: Fill out the structured PR template (`.github/PULL_REQUEST_TEMPLATE.md`).
