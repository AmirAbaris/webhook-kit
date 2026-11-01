// Polyfill Promise.withResolvers for Node < 22 environments during build
if (typeof Promise.withResolvers !== "function") {
  Promise.withResolvers = function () {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

import { defineConfig } from "tsdown";
import fs from "node:fs";

export default defineConfig({
  entry: ["./src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  target: "node18",
  onSuccess: async () => {
    if (fs.existsSync("dist/index.cjs")) {
      fs.copyFileSync("dist/index.cjs", "dist/index.js");
    }
    if (fs.existsSync("dist/index.d.mts")) {
      fs.copyFileSync("dist/index.d.mts", "dist/index.d.ts");
    }
  },
});
