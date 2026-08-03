import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "dotenv";
import { configDefaults, defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const require = createRequire(import.meta.url);
const zodV4CorePath = require.resolve("zod/v4/core");
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const isE2E = process.env.RUN_E2E_FLOW_TESTS === "true";
const envFile = isE2E ? "./.env.e2e" : "./.env.test";
const env = existsSync(envFile) ? config({ path: envFile }).parsed : undefined;

export default defineConfig({
  plugins: [tsconfigPaths()],
  // Vitest runs outside Next, so it must compile JSX instead of inheriting
  // Next's tsconfig `jsx: "preserve"` setting.
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "zod/v4/core": zodV4CorePath,
      // Declared here rather than left to vite-tsconfig-paths: tsconfig.json
      // excludes test files from the production type graph, so the plugin does
      // not apply path mappings to them.
      "@/": `${rootDir.replace(/\\/g, "/")}/`,
      // posthog-js/react's package `main` is a UMD bundle whose bare
      // `require("react")` cannot be resolved from its pnpm store location.
      // Point at the ESM build, which Vite resolves through the app instead.
      "posthog-js/react": path.resolve(
        rootDir,
        "node_modules/posthog-js/react/dist/esm/index.js",
      ),
    },
  },
  test: {
    environment: "node",
    // Vitest's 5s default is tight for this repo's module graph on slower
    // machines: several suites do 3-9s of real work and fail spuriously, and a
    // test that times out keeps running, so its mock calls land in the next
    // test and fail that one too. Still low enough to catch a genuine hang.
    testTimeout: 20_000,
    setupFiles: ["./__tests__/setup.ts"],
    exclude: [...configDefaults.exclude, "__tests__/playwright/**"],
    server: {
      deps: {
        inline: [/@hookform\/resolvers/],
      },
    },
    env: {
      ...env,
    },
  },
});
