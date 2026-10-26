import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { ESLint } = createRequire(path.join(root, "apps/web/package.json"))("eslint");

test("app ESLint configs enforce dependency boundaries for aliases and relative imports", async () => {
  const cases = [
    ["web", "shared/probe.ts", 'import "@/features/health/api";', true],
    ["web", "shared/probe.ts", 'export * from "../features/health/api";', true],
    ["web", "features/health/probe.ts", 'import "../../app/providers";', true],
    ["web", "features/health/probe.ts", 'import("../other/internal");', true],
    ["web", "shared/probe.ts", 'import "../../api/src/app.module";', true],
    ["web", "app/probe.ts", 'import "@/features/health/api";', false],
    ["web", "features/health/probe.ts", 'import "../../shared/http/api-error";', false],
    ["api", "src/common/probe.ts", 'import "../modules/health/health.service";', true],
    ["api", "src/database/probe.ts", 'import "../modules/health/health.service";', true],
    ["api", "src/database/probe.ts", 'import "../modules/health/health.service.js";', true],
    ["api", "src/modules/health/probe.ts", 'import "../../app.module.js";', true],
    ["api", "src/modules/health/probe.ts", 'import "../../database/database.service.js";', false],
  ];
  for (const [app, file, source, blocked] of cases) {
    const eslint = new ESLint({
      cwd: path.join(root, "apps", app),
      // This test runs from the root, so React auto-detection has no app package.
      overrideConfig: app === "web" ? { settings: { react: { version: "19.3.1" } } } : undefined,
    });
    const result = await eslint.lintText(source, { filePath: path.join(root, "apps", app, file) });
    assert.equal(result[0].messages.some((message) => message.ruleId === "boundaries/imports"), blocked, `${app}/${file}: ${source}`);
  }
});
