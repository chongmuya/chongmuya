import eslintConfigPrettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import boundaries from "../../tools/eslint-boundaries.mjs";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  { plugins: { boundaries }, rules: { "boundaries/imports": "error" } },
  globalIgnores([".next/**", "next-env.d.ts"]),
  eslintConfigPrettier,
]);
