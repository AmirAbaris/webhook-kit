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

function handleInitAgent(args) {
  let targetFile = null;
  const targetIndex = args.indexOf("--target");
  if (targetIndex !== -1 && args[targetIndex + 1]) {
    targetFile = args[targetIndex + 1];
  } else {
    // Autodetect existing agent instruction file in current working directory
    const candidates = [
      "AGENTS.md",
      "CLAUDE.md",
      ".cursorrules",
      ".github/copilot-instructions.md",
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(path.resolve(process.cwd(), candidate))) {
        targetFile = candidate;
        break;
      }
    }
    // Default to AGENTS.md if none found
    if (!targetFile) {
      targetFile = "AGENTS.md";
    }
  }

  const resolvedPath = path.resolve(process.cwd(), targetFile);
  let existingContent = "";
  const fileExists = fs.existsSync(resolvedPath);

  if (fileExists) {
    existingContent = fs.readFileSync(resolvedPath, "utf8");
  }

  let updatedContent = "";
  if (
    existingContent.includes(START_MARKER) &&
    existingContent.includes(END_MARKER)
  ) {
    // Replace existing block
    const regex = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}`, "g");
    updatedContent = existingContent.replace(regex, AGENT_RULES_CONTENT);
    console.log(`✓ Updated existing webhook-kit rules in ${targetFile}`);
  } else {
    // Append to file
    const separator =
      existingContent.length > 0 && !existingContent.endsWith("\n\n")
        ? "\n\n"
        : "";
    updatedContent = `${existingContent}${separator}${AGENT_RULES_CONTENT}\n`;
    console.log(`✓ Injected webhook-kit rules into ${targetFile}`);
  }

  // Ensure parent directory exists
  const parentDir = path.dirname(resolvedPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  fs.writeFileSync(resolvedPath, updatedContent, "utf8");
  console.log(`Rules synchronized successfully at ${resolvedPath}`);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    printHelp();
    process.exit(0);
  }

  if (command === "version" || command === "--version" || command === "-v") {
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
