import eslintConfigPrettier from "eslint-config-prettier/flat";
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
  {
    files: ["scripts/restaurant-data.mjs"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "^\\.\\./dist/(?:app\\.module\\.js|bootstrap/|database/seeds/|config/environment\\.js|modules/(?!restaurants/(?:restaurant-data\\.service\\.js|types/restaurant-data\\.js)$))",
              message:
                "The operational data CLI composes only the DB and restaurants data service.",
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
]);
