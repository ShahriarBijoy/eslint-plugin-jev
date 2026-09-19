import { defineConfig } from "tsup";
export default defineConfig({
  entry: { index: "src/index.ts", worker: "src/worker/worker.ts" },
  format: ["esm"], dts: { entry: { index: "src/index.ts" } },
  sourcemap: true, clean: true, target: "node20", splitting: false,
});
