import { defineConfig } from "eslint/config";
import tsParser from "@typescript-eslint/parser";
import jev from "eslint-plugin-jev";

export default defineConfig([
  {
    files: ["src/**/*.ts"],
    languageOptions: { parser: tsParser, ecmaVersion: 2023, sourceType: "module" },
  },
  ...jev.configs.recommended,
]);
