import { defineConfig, globalIgnores } from "eslint/config";
export default defineConfig([
  globalIgnores(["dist", "coverage", "examples"]),
  { files: ["src/**/*.ts", "tests/**/*.ts"], languageOptions: { parser: (await import("@typescript-eslint/parser")).default } },
]);
