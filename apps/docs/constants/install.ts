export const PACKAGE_MANAGERS = [
  { id: "pnpm", command: "pnpm add @amirabaris/webhook-kit" },
  { id: "npm", command: "npm install @amirabaris/webhook-kit" },
  { id: "bun", command: "bun add @amirabaris/webhook-kit" },
  { id: "yarn", command: "yarn add @amirabaris/webhook-kit" },
] as const

export type PackageManagerId = (typeof PACKAGE_MANAGERS)[number]["id"]
