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
    [
      "api",
      "src/modules/auth/probe.module.ts",
      'import { AccessGuard } from "./jwt-access.guard.js"; export { AccessGuard };',
      true,
    ],
    [
      "api",
      "src/modules/events/probe.ts",
      'import { GroupsService } from "../groups/groups.service.js";',
      false,
    ],
    [
      "api",
      "src/modules/events/probe.ts",
      'import { AccessGuard } from "../auth/jwt-access.guard.js";',
      false,
    ],
    [
      "api",
      "src/modules/events/probe.ts",
      'import { OptionalAccessGuard } from "../auth/jwt-access.guard.js";',
      true,
    ],
    [
      "api",
      "src/modules/events/probe.ts",
      'import type { AuthUser } from "../auth/auth-user.js";',
      false,
    ],
    [
      "api",
      "src/modules/events/probe.ts",
      'import { CurrentUser } from "../auth/current-user.decorator.js";',
      false,
    ],
    [
      "api",
      "src/modules/events/probe.ts",
      'import { AuthRepository } from "../auth/auth.repository.js";',
      true,
    ],
    [
      "api",
      "src/modules/events/probe.ts",
      'import { Group } from "../groups/group.entity.js";',
      true,
    ],
    [
      "api",
      "src/modules/events/probe.ts",
      'import { InternalService } from "../groups/internal.service.js";',
      true,
    ],
    [
      "api",
      "src/modules/events/probe.ts",
      'export * from "../groups/groups.service.js";',
      true,
    ],
    [
      "api",
      "src/modules/events/probe.ts",
      'import("../groups/groups.service.js");',
      true,
    ],
    [
      "api",
      "src/modules/auth/probe.module.ts",
      'export { AccessGuard } from "./jwt-access.guard.js";',
      true,
    ],
    [
      "api",
      "src/config/probe.ts",
      'import { GroupsService } from "../modules/groups/groups.service.js";',
      true,
    ],
    ["web", "shared/probe.ts", 'import "@/features/health/api";', true],
    ["web", "shared/probe.ts", 'export * from "../features/health/api";', true],
    ["web", "features/health/probe.ts", 'import "../../app/providers";', true],
    ["web", "features/health/probe.ts", 'import("../other/internal");', true],
    ["web", "shared/probe.ts", 'import "../../api/src/app.module";', true],
    ["web", "app/probe.ts", 'import "@/features/health/api";', false],
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

test("API source imports form an acyclic graph", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const ts = createRequire(path.join(root, "apps/api/package.json"))(
    "typescript",
  );
  const sourceRoot = path.join(root, "apps/api/src");
  const files = (await readdir(sourceRoot, { recursive: true }))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => path.join(sourceRoot, file));
  const known = new Set(files);
  const graph = new Map();
  for (const file of files) {
    const syntax = ts.createSourceFile(
      file,
      await readFile(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const imports = [];
    function visit(node) {
      const specifier =
        ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
          ? node.moduleSpecifier
          : undefined;
      if (
        specifier &&
        ts.isStringLiteral(specifier) &&
        specifier.text.startsWith(".")
      ) {
        const target = path.resolve(
          path.dirname(file),
          specifier.text.replace(/\.js$/, ".ts"),
        );
        if (known.has(target)) imports.push(target);
      }
      ts.forEachChild(node, visit);
    }
    visit(syntax);
    graph.set(file, imports);
  }
  const done = new Set();
  function visit(file, trail) {
    assert(
      !trail.includes(file),
      `API dependency cycle: ${[...trail, file].map((item) => path.relative(sourceRoot, item)).join(" → ")}`,
    );
    if (done.has(file)) return;
    for (const target of graph.get(file)) visit(target, [...trail, file]);
    done.add(file);
  }
  for (const file of files) visit(file, []);
});
