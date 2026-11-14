import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { ESLint } = createRequire(path.join(root, "apps/web/package.json"))(
  "eslint",
);

test("app ESLint configs enforce dependency boundaries for aliases and relative imports", async () => {
  const cases = [
    ["web", "shared/probe.ts", 'import "@/features/health/api";', true],
    ["web", "shared/probe.ts", 'export * from "../features/health/api";', true],
    ["web", "features/health/probe.ts", 'import "../../app/providers";', true],
    ["web", "features/health/probe.ts", 'import("../other/internal");', true],
    ["web", "shared/probe.ts", 'import "../../api/src/app.module";', true],
    ["web", "app/probe.ts", 'import "@/features/health/client";', false],
    ["web", "app/probe.ts", 'import "@/features/health/api";', true],
    [
      "web",
      "features/groups/probe.ts",
      'import { useAuth } from "@/features/auth/client";',
      false,
    ],
    [
      "web",
      "features/groups/probe.ts",
      'import type { Account } from "@/features/auth/types";',
      false,
    ],
    [
      "web",
      "features/groups/probe.ts",
      'export { useAuth } from "../auth/client";',
      false,
    ],
    [
      "web",
      "features/groups/probe.ts",
      'import("../auth/auth-provider");',
      true,
    ],
    ["web", "features/groups/probe.ts", 'require("../auth/session");', true],
    ["web", "features/auth/probe.ts", 'import "../groups/client";', true],
    [
      "web",
      "features/groups/probe.ts",
      '"use client"; import "../auth/server";',
      true,
    ],
    [
      "web",
      "features/groups/probe.ts",
      'import "@chongmuya/api/src/app.module";',
      true,
    ],
    [
      "web",
      "features/health/probe.ts",
      'import "../../shared/http/api-error";',
      false,
    ],
    [
      "api",
      "src/common/probe.ts",
      'import "../modules/health/health.service";',
      true,
    ],
    [
      "api",
      "src/database/probe.ts",
      'import "../modules/health/health.service";',
      true,
    ],
    [
      "api",
      "src/database/probe.ts",
      'import "../modules/health/health.service.js";',
      true,
    ],
    [
      "api",
      "src/modules/health/probe.ts",
      'import "../../app.module.js";',
      true,
    ],
    [
      "api",
      "src/modules/health/probe.ts",
      'import "../../database/database.service.js";',
      false,
    ],
  ];
  for (const [app, file, source, blocked] of cases) {
    const eslint = new ESLint({
      cwd: path.join(root, "apps", app),
      // This test runs from the root, so React auto-detection has no app package.
      overrideConfig:
        app === "web"
          ? { settings: { react: { version: "19.3.1" } } }
          : undefined,
    });
    const result = await eslint.lintText(source, {
      filePath: path.join(root, "apps", app, file),
    });
    assert.equal(
      result[0].messages.some(
        (message) => message.ruleId === "boundaries/imports",
      ),
      blocked,
      `${app}/${file}: ${source}`,
    );
  }
});

test("feature cycles are rejected across multiple edges, including type dependencies", async () => {
  const { hasDependencyPath } = await import("./eslint-boundaries.mjs");
  const graph = new Map([
    ["groups", new Set(["auth"])],
    ["events", new Set(["groups"])],
    ["profile", new Set(["events"])],
  ]);
  assert.equal(hasDependencyPath(graph, "profile", "auth"), true);
  assert.equal(hasDependencyPath(graph, "auth", "profile"), false);
  graph.set("auth", new Set(["profile"]));
  assert.equal(hasDependencyPath(graph, "events", "health"), false);
});
