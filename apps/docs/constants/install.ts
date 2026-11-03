export const PACKAGE_MANAGERS = [
  { id: "pnpm", command: "pnpm add webhook-kit" },
  { id: "npm", command: "npm install webhook-kit" },
  { id: "bun", command: "bun add webhook-kit" },
  { id: "yarn", command: "yarn add webhook-kit" },
] as const

export type PackageManagerId = (typeof PACKAGE_MANAGERS)[number]["id"]
