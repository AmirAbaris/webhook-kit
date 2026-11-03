import stylistic from "@stylistic/eslint-plugin";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".pnpm-store/**",
      "coverage/**",
      ".agents/**",
      ".gemini/**",
      "apps/**",
    ],
  },
  {
    files: ["**/*.ts", "**/*.mts"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: {
      "@stylistic": stylistic,
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      // WHY: Prettier preserves 0 vs 1 blank lines between declarations.
      // Enforce mandatory vertical spacing between top-level functions, overloads,
      // exports, classes, interfaces, and type aliases.
      "@stylistic/padding-line-between-statements": [
        "error",
        {
          blankLine: "always",
          prev: "*",
          next: [
            "function",
            "function-overload",
            "export",
            "class",
            "interface",
            "type",
          ],
        },
        {
          blankLine: "always",
          prev: [
            "function",
            "function-overload",
            "export",
            "class",
            "interface",
            "type",
          ],
          next: "*",
        },
        {
          blankLine: "any",
          prev: "import",
          next: "import",
        },
      ],
      complexity: ["error", { max: 7 }],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      // WHY: webhook-kit is a universal Web Crypto library that must run across
      // Cloudflare Workers, Deno, Bun, and Edge runtimes without Node.js built-ins.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "crypto",
              message:
                "Do not import 'crypto' in universal source code. Use globalThis.crypto.subtle instead.",
            },
            {
              name: "node:crypto",
              message:
                "Do not import 'node:crypto' in universal source code. Use globalThis.crypto.subtle instead.",
            },
            {
              name: "buffer",
              message:
                "Do not import 'buffer' in universal source code. Use Uint8Array and TextEncoder/TextDecoder instead.",
            },
            {
              name: "node:buffer",
              message:
                "Do not import 'node:buffer' in universal source code. Use Uint8Array and TextEncoder/TextDecoder instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/index.ts", "src/providers/index.ts"],
    rules: {
      // WHY: Barrel re-export files group related module exports intentionally.
      "@stylistic/padding-line-between-statements": "off",
    },
  },
];
