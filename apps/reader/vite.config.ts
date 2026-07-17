import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const suiteRoot = resolve(rootDir, "../..");

function resolveDataDir(): string {
  const configured = process.env.CGV_DATA_PATH;
  if (configured) return resolve(suiteRoot, configured);

  const sibling = resolve(suiteRoot, "../cgv-data");
  if (existsSync(sibling)) return sibling;

  return resolve(suiteRoot, "../cgv-data");
}

const cgvDataDir = resolveDataDir();

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/cgv-suite/" : "/",
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      "@cgv-data": cgvDataDir,
      "@cgv/core": resolve(suiteRoot, "packages/core/src/index.ts"),
      "@cgv-lbf": resolve(suiteRoot, "data/lbf"),
      "cgv-bible": resolve(suiteRoot, "vendor/cgv-bible/src/index.ts")
    }
  },
  server: {
    port: 1423,
    strictPort: true,
    fs: {
      allow: [suiteRoot, cgvDataDir, resolve(suiteRoot, "data")]
    }
  },
  build: {
    target: "safari13"
  }
}));
