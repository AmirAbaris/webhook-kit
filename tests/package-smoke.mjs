import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Create an isolated temporary directory for sandbox consumer verification
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-kit-smoke-"));

console.log("Starting webhook-kit package smoke test...");
console.log(`Sandbox: ${tempDir}`);

try {
  // 1. Build the library if dist does not already exist (e.g. from CI build artifact)
  if (!fs.existsSync(path.join(rootDir, "dist/index.mjs"))) {
    console.log("Step 1: Building distribution artifacts...");
    execSync("pnpm build", { cwd: rootDir, stdio: "inherit" });
  } else {
    console.log("Step 1: Using pre-built distribution artifacts...");
  }

  // 2. Pack tarball into the sandbox directory
  console.log("Step 2: Packing npm tarball...");
  const packOutput = execSync(`pnpm pack --pack-destination "${tempDir}"`, {
    cwd: rootDir,
    encoding: "utf8",
  }).trim();

  // Find the generated tarball file name
  const tarballFiles = fs
    .readdirSync(tempDir)
    .filter((f) => f.endsWith(".tgz"));
  if (tarballFiles.length === 0) {
    throw new Error(
      `Failed to find packed tarball in ${tempDir}. pack output: ${packOutput}`,
    );
  }
  const tarballName = tarballFiles[0];
  const tarballPath = path.join(tempDir, tarballName);
  console.log(`Generated tarball: ${tarballName}`);

  // 3. Create consumer package.json inside sandbox
  console.log("Step 3: Setting up isolated consumer project...");
  const consumerPackageJson = {
    name: "smoke-consumer",
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
  console.log("Step 4: Installing tarball in sandbox...");
  execSync(`npm install --no-package-lock "${tarballPath}"`, {
    cwd: tempDir,
    stdio: "inherit",
  });

  // 5. Verify zero runtime dependencies in sandbox node_modules
  console.log("Step 5: Verifying zero runtime dependencies...");
  const nodeModulesDir = path.join(tempDir, "node_modules");
  const installedPackages = fs
    .readdirSync(nodeModulesDir)
    .filter((pkg) => !pkg.startsWith("."));

  const isExpectedPackage =
    (installedPackages.length === 1 &&
      installedPackages[0] === "@amirabaris" &&
      fs.existsSync(path.join(nodeModulesDir, "@amirabaris", "webhook-kit"))) ||
    (installedPackages.length === 1 && installedPackages[0] === "webhook-kit");

  if (!isExpectedPackage) {
    throw new Error(
      `Zero-dependency policy violated! Found unexpected packages in node_modules: ${installedPackages.join(", ")}`,
    );
  }
  console.log(
    "Zero runtime dependencies confirmed: only @amirabaris/webhook-kit was installed.",
  );

  // 6. Test ESM import in isolated sandbox
  console.log("Step 6: Verifying ESM package imports...");
  const testConsumerScript = `
    import {
      verifyWebhookSignature,
      assertWebhookSignature,
      createWebhookHandler,
      createInMemoryReplayStore,
      InMemoryReplayStore,
      WebhookKitError,
      SignatureVerificationError,
      ReplayAttackError
    } from '@amirabaris/webhook-kit';

    if (typeof verifyWebhookSignature !== 'function') {
      throw new Error('verifyWebhookSignature is not exported as a function');
    }
    if (typeof assertWebhookSignature !== 'function') {
      throw new Error('assertWebhookSignature is not exported as a function');
    }
    if (typeof createWebhookHandler !== 'function') {
      throw new Error('createWebhookHandler is not exported as a function');
    }
    if (typeof createInMemoryReplayStore !== 'function') {
      throw new Error('createInMemoryReplayStore is not exported as a function');
    }
    if (typeof InMemoryReplayStore !== 'function') {
      throw new Error('InMemoryReplayStore is not exported');
    }
    if (typeof ReplayAttackError !== 'function') {
      throw new Error('ReplayAttackError is not exported');
    }
    if (typeof WebhookKitError !== 'function') {
      throw new Error('WebhookKitError is not exported');
    }
    console.log('ESM exports loaded successfully');
  `;

  fs.writeFileSync(
    path.join(tempDir, "test-import.mjs"),
    testConsumerScript,
    "utf8",
  );
  execSync("node test-import.mjs", { cwd: tempDir, stdio: "inherit" });

  // 6.2 Test CJS require in isolated sandbox
  console.log("Step 6.2: Verifying CommonJS package require...");
  const testCjsConsumerScript = `
    const {
      verifyWebhookSignature,
      assertWebhookSignature,
      createWebhookHandler,
      createInMemoryReplayStore,
      InMemoryReplayStore,
      WebhookKitError,
      SignatureVerificationError,
      ReplayAttackError
    } = require('@amirabaris/webhook-kit');

    if (typeof verifyWebhookSignature !== 'function') {
      throw new Error('CJS: verifyWebhookSignature is not exported as a function');
    }
    if (typeof assertWebhookSignature !== 'function') {
      throw new Error('CJS: assertWebhookSignature is not exported as a function');
    }
    if (typeof createWebhookHandler !== 'function') {
      throw new Error('CJS: createWebhookHandler is not exported as a function');
    }
    if (typeof createInMemoryReplayStore !== 'function') {
      throw new Error('CJS: createInMemoryReplayStore is not exported as a function');
    }
    if (typeof InMemoryReplayStore !== 'function') {
      throw new Error('CJS: InMemoryReplayStore is not exported');
    }
    if (typeof ReplayAttackError !== 'function') {
      throw new Error('CJS: ReplayAttackError is not exported');
    }
    if (typeof WebhookKitError !== 'function') {
      throw new Error('CJS: WebhookKitError is not exported');
    }
    console.log('CommonJS exports loaded successfully');
  `;

  fs.writeFileSync(
    path.join(tempDir, "test-import.cjs"),
    testCjsConsumerScript,
    "utf8",
  );
  execSync("node test-import.cjs", { cwd: tempDir, stdio: "inherit" });

  // 7. Test CLI binary in sandbox
  console.log("Step 7: Verifying CLI binary execution...");
  const cliOutput = execSync("npx webhook-kit --version", {
    cwd: tempDir,
    encoding: "utf8",
  }).trim();
  console.log(`CLI executed successfully: ${cliOutput}`);

  // 7.1 Test CLI init-agent command in sandbox
  console.log("Step 7.1: Verifying CLI init-agent execution...");
  execSync("npx webhook-kit init-agent --target AGENTS.md", {
    cwd: tempDir,
    stdio: "inherit",
  });
  const injectedContent = fs.readFileSync(
    path.join(tempDir, "AGENTS.md"),
    "utf8",
  );
  if (
    !injectedContent.includes("<!-- webhook-kit-agent-rules:start -->") ||
    !injectedContent.includes("Strict Format & Tolerance Hardening")
  ) {
    throw new Error("CLI init-agent failed to inject expected hardened rules");
  }
  console.log("CLI init-agent verified successfully");

  console.log("\nPackage smoke test PASSED successfully!");
} catch (error) {
  console.error("\nPackage smoke test FAILED:", error);
  process.exit(1);
} finally {
  // Clean up sandbox
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log(`Cleaned up sandbox: ${tempDir}`);
  } catch (cleanupError) {
    console.warn(`Failed to clean up sandbox at ${tempDir}:`, cleanupError);
  }
}
