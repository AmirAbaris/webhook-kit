#!/usr/bin/env node

/**
 * webhook-kit CLI
 * Zero-dependency developer and agent tooling.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const START_MARKER = "<!-- webhook-kit-agent-rules:start -->";
const END_MARKER = "<!-- webhook-kit-agent-rules:end -->";

const AGENT_FILE_CANDIDATES = [
  "AGENTS.md",
  "CLAUDE.md",
  ".cursorrules",
  ".github/copilot-instructions.md",
];

const AGENT_RULES_CONTENT = `${START_MARKER}
### Webhook Signature Verification Rules (webhook-kit)
- **NEVER parse JSON before verifying signatures**: In frameworks like Next.js, Hono, or Express, parsing JSON reorders keys and strips whitespace, invalidating cryptographic HMAC checks. Always pass the raw \`Request\` or raw text string.
- **Constant-Time Verification**: Never compare signatures with \`===\` or \`!==\`. Always use \`timingSafeEqual\` or \`verifyWebhookSignature\` from \`webhook-kit\`.
- **Zero Node-Only Crypto**: Web standard environments (Cloudflare Workers, Next.js Edge, Bun, Deno) do not support \`node:crypto\`. Rely on \`webhook-kit\` which uses \`crypto.subtle\`.
- **Conventional Commits**: Follow \`type(scope): message\` (e.g. \`feat(stripe): add tolerance check\`).
${END_MARKER}`;

function printHelp() {
  console.log(`
webhook-kit CLI

Usage:
  npx webhook-kit <command> [options]

Commands:
  init-agent       Inject or update webhook-kit rules into AGENTS.md or CLAUDE.md
  version, -v      Print current version
  help, -h         Show this help message

Options for init-agent:
  --target <file>  Target file (default: autodetects AGENTS.md or CLAUDE.md)
`);
}

function getPackageVersion() {
  try {
    const pkgPath = path.resolve(__dirname, "../package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return pkg.version || "0.1.0";
  } catch {
    return "0.1.0";
  }
}

function resolveTargetAgentFile(args) {
  const targetIndex = args.indexOf("--target");
  if (targetIndex !== -1 && args[targetIndex + 1]) {
    return args[targetIndex + 1];
  }
  const existing = AGENT_FILE_CANDIDATES.find((candidate) =>
    fs.existsSync(path.resolve(process.cwd(), candidate)),
  );
  return existing ?? "AGENTS.md";
}

function buildUpdatedAgentContent(existingContent, targetFile) {
  const hasMarkers =
    existingContent.includes(START_MARKER) &&
    existingContent.includes(END_MARKER);

  if (hasMarkers) {
    const regex = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}`, "g");
    console.log(`✓ Updated existing webhook-kit rules in ${targetFile}`);
    return existingContent.replace(regex, AGENT_RULES_CONTENT);
  }

  const separator =
    existingContent.length > 0 && !existingContent.endsWith("\n\n")
      ? "\n\n"
      : "";
  console.log(`✓ Injected webhook-kit rules into ${targetFile}`);
  return `${existingContent}${separator}${AGENT_RULES_CONTENT}\n`;
}

function handleInitAgent(args) {
  const targetFile = resolveTargetAgentFile(args);
  const resolvedPath = path.resolve(process.cwd(), targetFile);
  const existingContent = fs.existsSync(resolvedPath)
    ? fs.readFileSync(resolvedPath, "utf8")
    : "";

  const updatedContent = buildUpdatedAgentContent(existingContent, targetFile);
  const parentDir = path.dirname(resolvedPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  fs.writeFileSync(resolvedPath, updatedContent, "utf8");
  console.log(`Rules synchronized successfully at ${resolvedPath}`);
}

const HELP_FLAGS = new Set(["help", "--help", "-h"]);
const VERSION_FLAGS = new Set(["version", "--version", "-v"]);

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || HELP_FLAGS.has(command)) {
    printHelp();
    process.exit(0);
  }

  if (VERSION_FLAGS.has(command)) {
    console.log(`webhook-kit v${getPackageVersion()}`);
    process.exit(0);
  }

  if (command === "init-agent") {
    handleInitAgent(args.slice(1));
    process.exit(0);
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

main();
