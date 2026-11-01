#!/usr/bin/env node

/**
 * tests/package-smoke.mjs
 *
 * Package smoke test:
 * Verifies that the packed npm tarball can be installed in an isolated,
 * clean sandbox directory with zero runtime dependencies and imported correctly.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-kit-smoke-"));

console.log("🧪 Starting webhook-kit package smoke test...");
console.log(`📁 Sandbox: ${tempDir}`);

try {
  // 1. Build the library if dist does not already exist (e.g. from CI build artifact)
  if (!fs.existsSync(path.join(rootDir, "dist/index.mjs"))) {
    console.log("📦 Step 1: Building distribution artifacts...");
    execSync("pnpm build", { cwd: rootDir, stdio: "inherit" });
  } else {
    console.log("📦 Step 1: Using pre-built distribution artifacts...");
  }

  // 2. Pack tarball into the sandbox directory
  console.log("📦 Step 2: Packing npm tarball...");
  const packOutput = execSync(`pnpm pack --pack-destination "${tempDir}"`, {
    cwd: rootDir,
    encoding: "utf8",
  }).trim();

  // Find the generated .tgz file
  const tarballName = fs
    .readdirSync(tempDir)
    .find((file) => file.endsWith(".tgz"));

  if (!tarballName) {
    throw new Error(
      `Tarball not found in ${tempDir}. Pack output: ${packOutput}`,
    );
  }

  const tarballPath = path.join(tempDir, tarballName);
  console.log(`✓ Generated tarball: ${tarballName}`);

  // 3. Initialize sandbox project
  console.log("📦 Step 3: Setting up isolated consumer project...");
  const consumerPackageJson = {
    name: "webhook-kit-smoke-consumer",
    version: "1.0.0",
    type: "module",
    private: true,
  };

  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    JSON.stringify(consumerPackageJson, null, 2),
    "utf8",
  );

  // 4. Install the tarball into sandbox
  console.log("📦 Step 4: Installing tarball in sandbox...");
  execSync(`npm install --no-package-lock "${tarballPath}"`, {
    cwd: tempDir,
    stdio: "inherit",
  });

  // 5. Verify zero runtime dependencies in sandbox node_modules
  console.log("🔍 Step 5: Verifying zero runtime dependencies...");
  const nodeModulesDir = path.join(tempDir, "node_modules");
  const installedPackages = fs
    .readdirSync(nodeModulesDir)
    .filter((pkg) => !pkg.startsWith("."));

  if (
    installedPackages.length !== 1 ||
    installedPackages[0] !== "webhook-kit"
  ) {
    throw new Error(
      `Zero-dependency policy violated! Found unexpected packages in node_modules: ${installedPackages.join(", ")}`,
    );
  }
  console.log(
    "✓ Zero runtime dependencies confirmed: only webhook-kit was installed.",
  );

  // 6. Test ESM import in isolated sandbox
  console.log("🔬 Step 6: Verifying ESM package imports...");
  const testConsumerScript = `
    import {
      verifyWebhookSignature,
      assertWebhookSignature,
      WebhookKitError,
      SignatureVerificationError
    } from 'webhook-kit';

    if (typeof verifyWebhookSignature !== 'function') {
      throw new Error('verifyWebhookSignature is not exported as a function');
    }
    if (typeof assertWebhookSignature !== 'function') {
      throw new Error('assertWebhookSignature is not exported as a function');
    }
    if (typeof WebhookKitError !== 'function') {
      throw new Error('WebhookKitError is not exported');
    }
    console.log('✓ ESM exports loaded successfully');
  `;

  fs.writeFileSync(
    path.join(tempDir, "test-import.mjs"),
    testConsumerScript,
    "utf8",
  );
  execSync("node test-import.mjs", { cwd: tempDir, stdio: "inherit" });

  // 7. Test CLI binary in sandbox
  console.log("⚙️ Step 7: Verifying CLI binary execution...");
  const cliOutput = execSync("npx webhook-kit --version", {
    cwd: tempDir,
    encoding: "utf8",
  }).trim();
  console.log(`✓ CLI executed successfully: ${cliOutput}`);

  console.log("\n🎉 Package smoke test PASSED successfully!");
} catch (error) {
  console.error("\n❌ Package smoke test FAILED:", error);
  process.exit(1);
} finally {
  // Clean up sandbox
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log(`🧹 Cleaned up sandbox: ${tempDir}`);
  } catch (cleanupError) {
    console.warn(`Failed to clean up sandbox at ${tempDir}:`, cleanupError);
  }
}
