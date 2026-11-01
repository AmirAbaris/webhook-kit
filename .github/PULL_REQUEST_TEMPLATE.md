## Summary

<!-- Briefly explain the motivation and high-level goal of this pull request. -->

## Changes

<!-- List specific changes, additions, or bug fixes. -->

-

## Verification

<!-- Describe how these changes were tested and verified. -->

- [ ] Linting & formatting check passed (`pnpm lint`)
- [ ] TypeScript build passed (`pnpm build`)
- [ ] Unit & integration tests passed (`pnpm test`)
- [ ] Compile-time type tests passed (`pnpm test:types`)
- [ ] Package smoke test passed in isolated sandbox (`pnpm test:smoke`)

## Checklist

- [ ] My commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`type(scope): imperative description`, lowercase, no trailing period).
- [ ] No `node:crypto` or non-web-standard APIs were introduced in universal code.
- [ ] All cryptographic operations use constant-time comparisons (`timingSafeEqual`).
- [ ] New public APIs include TypeScript types and JSDoc documentation.
