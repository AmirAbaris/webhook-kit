export interface RuntimeItem {
  name: string
  support: string
  note: string
}

export const RUNTIMES: readonly RuntimeItem[] = [
  {
    name: "Node.js",
    support: ">= 22.0.0",
    note: "Uses native globalThis.crypto.subtle",
  },
  {
    name: "Bun",
    support: ">= 1.0.0",
    note: "Native Web Cryptography API",
  },
  {
    name: "Deno",
    support: ">= 1.30.0",
    note: "Native Web Standards",
  },
  {
    name: "Cloudflare Workers",
    support: "Supported",
    note: "Zero Node polyfills needed",
  },
  {
    name: "Next.js (Edge & Node)",
    support: "Supported",
    note: "Works with App Router Request",
  },
  {
    name: "Fastly Compute",
    support: "Supported",
    note: "Web Standards compliant",
  },
] as const
