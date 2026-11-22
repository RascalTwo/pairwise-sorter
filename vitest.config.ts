import { istanbul } from "@rascaltwo/r2-test-kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  plugins: [mode === "test" && istanbul()],
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // setup.ts only touches Chrome for the element tests, which import the harness themselves
    setupFiles: ["@rascaltwo/r2-test-kit/vitest", "./test/element/setup.ts"],
  },
}));
