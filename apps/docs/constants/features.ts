import type { LucideIcon } from "lucide-react"
import { Bot, Clock, Feather, Globe, Puzzle, ShieldCheck } from "lucide-react"

export interface FeatureItem {
  id: string
  icon: LucideIcon
  title: string
  description: string
}

export const FEATURES: readonly FeatureItem[] = [
  {
    id: "zero-dependencies",
    icon: Feather,
    title: "Zero Dependencies",
    description:
      "0 runtime dependencies for a tiny bundle footprint with zero supply-chain bloat or transitive vulnerabilities.",
  },
  {
    id: "universal-edge",
    icon: Globe,
    title: "Universal Edge Support",
    description:
      "Built entirely on the Web Cryptography API (crypto.subtle) and Web Standards (Request, Headers, Uint8Array). Runs on Node.js, Bun, Deno, Cloudflare Workers, Next.js Edge, and Fastly Compute.",
  },
  {
    id: "constant-time",
    icon: ShieldCheck,
    title: "Constant-Time Comparison",
    description:
      "Built-in timingSafeEqual evaluates every byte without short-circuiting, preventing timing side-channel attacks.",
  },
  {
    id: "replay-protection",
    icon: Clock,
    title: "Replay Protection",
    description:
      "Built-in timestamp tolerance verification rejects stale or replayed webhook deliveries outside your configured window.",
  },
  {
    id: "provider-plugins",
    icon: Puzzle,
    title: "Provider Plugins",
    description:
      "First-party adapters for Stripe (t=...,v1=...), GitHub (sha256=...), Shopify (Base64 HMAC), and custom WebhookProviderPlugin definitions.",
  },
  {
    id: "agent-first-dx",
    icon: Bot,
    title: "Agent-First DX",
    description:
      "Run npx webhook-kit init-agent to inject guardrails into AGENTS.md or CLAUDE.md so AI coding assistants never parse JSON before verifying HMAC.",
  },
] as const
