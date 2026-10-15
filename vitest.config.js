import { defineConfig } from "vitest/config";

// UNIT TIER ONLY. Everything here runs offline, with NO Foundry, in milliseconds: the pure
// decision functions in scripts/decide/ taking plain data. The live tier is the sandbox walk in
// tools/README.md, driven by hand against a real world; it is deliberately not a vitest suite.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.js"]
  }
});
