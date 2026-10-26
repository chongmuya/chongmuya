import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";
import boundaries from "../../tools/eslint-boundaries.mjs";

export default defineConfig([
  globalIgnores(["dist/**", "dist-test/**"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  { plugins: { boundaries }, rules: { "boundaries/imports": "error" } },
  {
    languageOptions: {
      globals: globals.node,
    },
  },
]);
