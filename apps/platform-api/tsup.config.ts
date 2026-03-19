import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["cjs"],
  target: "node20",
  outDir: "dist",
  clean: true,
  outExtension() {
    return {
      js: ".cjs"
    };
  },
  noExternal: [
    "@wifi-portal/game-sdk",
    "@wifi-portal/shared-observability"
  ]
});
