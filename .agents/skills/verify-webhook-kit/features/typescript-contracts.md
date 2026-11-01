# Feature: TypeScript Contracts & Type Narrowing

## Sub-features
- Generic type parameter propagation (`verifyWebhookSignature<T>` returns `WebhookVerificationResult<T>`).
- Direct payload unwrapping (`assertWebhookSignature<T>` returns `T`).
- Standardized custom error hierarchy (`WebhookKitError`, `SignatureVerificationError`, `TimestampToleranceError`, `PayloadExtractionError`).

## How to get to it (user POV)
A developer provides their custom event payload interface to `verifyWebhookSignature<MyEvent>()` and receives full autocompletion and type-safety on `result.payload`.

## Driving it with tsd
Run:
```bash
pnpm test:types
```

## Gotchas
- Must ensure declaration maps (`.d.ts.map`) match source files.
- Generics must not leak `any` under strict `noImplicitAny`.
