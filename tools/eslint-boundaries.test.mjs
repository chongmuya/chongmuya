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
      "src/modules/reservations/probe.ts",
      'import { NotificationsService } from "../notifications/notifications.service.js";',
      false,
    ],
    [
      "api",
      "src/modules/reservations/probe.ts",
      'import type { NotificationInput } from "../notifications/types/notification.js";',
      false,
    ],
    [
      "api",
      "src/modules/reservations/probe.ts",
      'import { Notification } from "../notifications/entities/notification.entity.js";',
      true,
    ],
    [
      "api",
      "src/modules/auth/probe.module.ts",
      'import { AccessGuard } from "./guards/jwt-access.guard.js"; export { AccessGuard };',
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
      'import { AccessGuard } from "../auth/guards/jwt-access.guard.js";',
      false,
    ],
    [
      "api",
      "src/modules/events/probe.ts",
      'import { OptionalAccessGuard } from "../auth/guards/optional-access.guard.js";',
      true,
    ],
    [
      "api",
      "src/modules/events/probe.ts",
      'import type { AuthUser } from "../auth/types/auth-user.js";',
      false,
    ],
    [
      "api",
      "src/modules/events/probe.ts",
      'import { CurrentUser } from "../auth/decorators/current-user.decorator.js";',
      false,
    ],
    [
      "api",
      "src/modules/events/probe.ts",
      'import { AuthAttemptsRepository } from "../auth/repositories/auth-attempts.repository.js";',
      true,
    ],
    [
      "api",
      "src/modules/events/probe.ts",
      'import { Group } from "../groups/entities/group.entity.js";',
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
      'export { AccessGuard } from "./guards/jwt-access.guard.js";',
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
    ["web", "app/probe.ts", 'import "@/features/health/client";', false],
    ["web", "app/probe.ts", 'import "@/features/health/api";', true],
    [
      "web",
      "features/events/components/probe.ts",
      '"use client"; import { useGroups } from "@/features/groups/client"; import type { SessionRequest } from "@/features/auth/types";',
      false,
    ],
    [
      "web",
      "features/events/components/probe.ts",
      '"use client"; import { useGroups } from "../../groups/client";',
      false,
    ],
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

test("boundary diagnostics distinguish internal imports, cycles and server-only entries", async () => {
  const eslint = new ESLint({
    cwd: path.join(root, "apps/web"),
    overrideConfig: { settings: { react: { version: "19.3.1" } } },
  });
  const cases = [
    [
      "events",
      'import { useGroups } from "@/features/groups/hooks/use-groups";',
      "featureInternal",
    ],
    [
      "auth",
      'import { useGroups } from "@/features/groups/client";',
      "featureCycle",
    ],
    [
      "groups",
      '"use client"; import "@/features/auth/server";',
      "clientServer",
    ],
  ];
  for (const [feature, source, messageId] of cases) {
    const [result] = await eslint.lintText(source, {
      filePath: path.join(root, "apps/web/features", feature, "probe.ts"),
    });
    assert.deepEqual(
      result.messages
        .filter((message) => message.ruleId === "boundaries/imports")
        .map((message) => message.messageId),
      [messageId],
    );
  }
});

test("offline seeds can use entities but remain isolated from runtime services", async () => {
  const eslint = new ESLint({ cwd: path.join(root, "apps/api") });
  const cases = [
    [
      "database/seeds/probe.ts",
      "../../modules/restaurants/entities/restaurant.entity.js",
      false,
    ],
    ["database/seeds/probe.ts", "../database-options.js", false],
    [
      "database/seeds/probe.ts",
      "../../modules/restaurants/types/restaurant-data.js",
      false,
    ],
    [
      "database/seeds/probe.ts",
      "../../modules/restaurants/lib/restaurant-data-id.js",
      false,
    ],
    [
      "database/seeds/probe.ts",
      "../../modules/restaurants/restaurant-data.service.js",
      true,
    ],
    ["database/seeds/probe.ts", "../migration-state.js", false],
    ["database/seeds/probe.ts", "../../config/database-environment.js", false],
    ["database/seeds/probe.ts", "../../modules/auth/utils/password.js", false],
    [
      "database/seeds/probe.ts",
      "../../modules/reservations/lib/merchant-link-codec.js",
      false,
    ],
    ["database/seeds/probe.ts", "../../config/environment.js", true],
    [
      "database/seeds/probe.ts",
      "../../modules/reservations/providers/fake-message.gateway.js",
      true,
    ],
    ["database/seeds/probe.ts", "./restaurants-demo.seed.js", false],
    [
      "database/seeds/probe.ts",
      "../../modules/restaurants/restaurants.service.js",
      true,
    ],
    [
      "database/seeds/probe.ts",
      "../../modules/restaurants/restaurants.module.js",
      true,
    ],
    ["database/seeds/probe.ts", "../../app.module.js", true],
    ["database/seeds/probe.ts", "../database.service.js", true],
    [
      "database/probe.ts",
      "../modules/restaurants/entities/restaurant.entity.js",
      true,
    ],
    [
      "modules/restaurants/probe.ts",
      "../../database/seeds/restaurants-demo.seed.js",
      true,
    ],
    [
      "modules/restaurants/probe.ts",
      "../../database/seeds/data/restaurants.local.json",
      true,
    ],
    ["database/probe.ts", "./seeds/restaurants-demo.seed.js", true],
    ["app.module.ts", "./database/seeds/run-demo.js", true],
  ];
  for (const [file, specifier, blocked] of cases) {
    const [result] = await eslint.lintText(`import "${specifier}";`, {
      filePath: path.join(root, "apps/api/src", file),
    });
    assert.equal(
      result.messages.some(
        (message) => message.ruleId === "boundaries/imports",
      ),
      blocked,
      `${file} → ${specifier}`,
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
