import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ts = createRequire(path.join(root, "apps/web/package.json"))(
  "typescript",
);
const publicEntries = new Set(["client", "server", "types"]);
// One ESLint process checks a single source snapshot; share the graph between files.
let dependencyGraph;

function resolveImport(filename, specifier) {
  const source = area(filename);
  if (specifier.startsWith("."))
    return path.resolve(path.dirname(filename), specifier);
  if (specifier.startsWith("@/"))
    return path.resolve(root, "apps", source.app, specifier.slice(2));
  if (specifier.startsWith("@chongmuya/"))
    return path.resolve(root, "apps", specifier.slice("@chongmuya/".length));
}

// Feature-level cycles include type-only edges: public types are still contracts.
function featureGraph() {
  const graph = new Map();
  function scan(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        scan(file);
        continue;
      }
      if (!/\.[cm]?[jt]sx?$/.test(file) || /\.(test|stories)\./.test(file))
        continue;
      const source = area(file);
      const edges = graph.get(source.feature) ?? new Set();
      graph.set(source.feature, edges);
      const ast = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node) {
        const literal =
          ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
            ? node.moduleSpecifier
            : ts.isCallExpression(node) &&
                (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                  (ts.isIdentifier(node.expression) &&
                    node.expression.text === "require"))
              ? node.arguments[0]
              : undefined;
        if (literal && ts.isStringLiteralLike(literal)) {
          const targetFile = resolveImport(file, literal.text);
          const target = targetFile && area(targetFile);
          if (
            target?.app === "web" &&
            target.layer === "features" &&
            target.feature !== source.feature
          )
            edges.add(target.feature);
        }
        ts.forEachChild(node, visit);
      }
      visit(ast);
    }
  }
  scan(path.join(root, "apps/web/features"));
  return graph;
}

export function hasDependencyPath(graph, start, end, visited = new Set()) {
  if (start === end) return true;
  if (visited.has(start)) return false;
  visited.add(start);
  return [...(graph.get(start) ?? [])].some((next) =>
    hasDependencyPath(graph, next, end, visited),
  );
}

function isPublicEntry(file) {
  const relative = path
    .relative(path.join(root, "apps/web/features"), file)
    .split(path.sep);
  return (
    relative.length === 2 &&
    publicEntries.has(relative[1].replace(/\.[cm]?[jt]sx?$/, ""))
  );
}

// Explicit public API, not a suffix-based allowance for every service/guard.
// Providers must also be exported by the owning Nest module. Types/decorators
// are source imports and do not require a DI registration.
const apiPublicImports = {
  "events/events.service": ["EventsService"],
  "restaurants/restaurants.service": ["RestaurantsService"],
  "auth/guards/jwt-access.guard": ["AccessGuard"],
  "auth/phone-verification.service": ["PhoneVerificationService"],
  "auth/auth.service": ["AuthService"],
  "auth/decorators/current-user.decorator": ["CurrentUser"],
  "auth/types/auth-user": ["AuthUser"],
  "groups/groups.service": ["GroupsService"],
};

function area(file) {
  const parts = path.relative(root, file).split(path.sep);
  if (parts[0] !== "apps") return null;
  const app = parts[1];
  const rest = parts.slice(app === "api" && parts[2] === "src" ? 3 : 2);
  return {
    app,
    isSource: app === "api" && parts[2] === "src",
    layer: rest[0]?.replace(/\.[cm]?[jt]sx?$/, ""),
    feature: rest[1],
  };
}

export default {
  rules: {
    imports: {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          boundary:
            "허용되지 않은 의존 방향입니다: {{source}} → {{target}}. docs/architecture.md를 확인하세요.",
          featureInternal:
            "다른 feature의 내부 파일은 직접 참조할 수 없습니다: {{source}} → {{specifier}}. features/{{feature}}의 client·types·server 공개 진입점을 사용하세요.",
          featureCycle:
            "feature 순환 의존이 생깁니다: {{source}} → {{target}}. 공개 진입점도 반대 방향의 의존 경로가 있으면 사용할 수 없습니다.",
          clientServer:
            "클라이언트 파일에서 서버 전용 진입점을 참조할 수 없습니다: {{specifier}}. 서버·클라이언트 공개 진입점을 분리하세요.",
        },
      },
      create(context) {
        const filename = context.filename;
        const source = area(filename);
        if (!source) return {};
        function check(node, declaration) {
          if (typeof node?.value !== "string") return;
          const specifier = node.value;
          const targetFile = resolveImport(filename, specifier);
          if (!targetFile) return;
          const target = area(targetFile);
          if (!target) return;
          let invalid = source.app !== target.app;
          let messageId = "boundary";
          if (source.app === "web") {
            const rank = { app: 0, features: 1, shared: 2 };
            invalid ||= rank[source.layer] > rank[target.layer];
            if (
              target.layer === "features" &&
              (source.layer === "app" ||
                (source.layer === "features" &&
                  source.feature !== target.feature))
            ) {
              if (!invalid && !isPublicEntry(targetFile)) {
                invalid = true;
                messageId = "featureInternal";
              }
              if (source.layer === "features" && !invalid) {
                dependencyGraph ??= featureGraph();
                if (
                  hasDependencyPath(
                    dependencyGraph,
                    target.feature,
                    source.feature,
                  )
                ) {
                  invalid = true;
                  messageId = "featureCycle";
                }
              }
            }
            const clientModule = context.sourceCode.ast.body.some(
              (item) =>
                item.type === "ExpressionStatement" &&
                item.expression.value === "use client",
            );
            if (
              !invalid &&
              clientModule &&
              /[/\\]server(?:\.[cm]?[jt]sx?)?$/.test(targetFile)
            ) {
              invalid = true;
              messageId = "clientServer";
            }
          }
          if (source.app === "api") {
            const sourceSeed =
              source.layer === "database" && source.feature === "seeds";
            const targetSeed =
              target.layer === "database" && target.feature === "seeds";
            const targetPath = path.relative(
              path.join(root, "apps/api/src"),
              targetFile,
            );
            // Offline seeds compose persisted data through entities and shared
            // connection options. They cannot start runtime services or DI.
            invalid ||=
              sourceSeed &&
              !targetSeed &&
              !/^modules\/[^/]+\/entities\/[^/]+\.entity\.[cm]?[jt]s$/.test(
                targetPath,
              ) &&
              !/^database\/database-options\.[cm]?[jt]s$/.test(targetPath) &&
              !/^config\/(database-environment|link-environment)\.[cm]?[jt]s$/.test(
                targetPath,
              ) &&
              !/^modules\/auth\/utils\/password\.[cm]?[jt]s$/.test(
                targetPath,
              ) &&
              !/^modules\/restaurants\/lib\/restaurant-policy\.[cm]?[jt]s$/.test(
                targetPath,
              ) &&
              !/^modules\/reservations\/lib\/(merchant-link-codec|message-delivery)\.[cm]?[jt]s$/.test(
                targetPath,
              );
            // Runtime code must never import a seed (including its JSON data).
            invalid ||= source.isSource && !sourceSeed && targetSeed;
            invalid ||=
              ["common", "config", "database"].includes(source.layer) &&
              target.layer === "modules" &&
              !sourceSeed;
            invalid ||=
              source.layer === "modules" &&
              ["bootstrap", "app.module"].includes(target.layer);
            const crossModule =
              source.layer === "modules" &&
              target.layer === "modules" &&
              source.feature !== target.feature;
            if (crossModule) {
              const publicPath = path
                .relative(path.join(root, "apps/api/src/modules"), targetFile)
                .replace(/\.[cm]?[jt]s$/, "");
              const allowed = apiPublicImports[publicPath];
              const publicImport =
                declaration?.type === "ImportDeclaration" &&
                declaration.specifiers.length > 0 &&
                declaration.specifiers.every(
                  (item) =>
                    item.type === "ImportSpecifier" &&
                    allowed?.includes(
                      item.imported.name ?? item.imported.value,
                    ),
                );
              invalid ||=
                !/\.module(?:\.[cm]?[jt]s)?$/.test(targetFile) && !publicImport;
            }
            // A module file composes DI, it is not an internal-code barrel.
            invalid ||=
              /\.module\.[cm]?[jt]s$/.test(filename) &&
              ["ExportNamedDeclaration", "ExportAllDeclaration"].includes(
                declaration?.type,
              );
          }
          if (invalid)
            context.report({
              node,
              messageId,
              data: {
                source: [
                  source.app,
                  source.layer,
                  ...(["features", "modules"].includes(source.layer)
                    ? [source.feature]
                    : []),
                ].join("/"),
                target: [
                  target.app,
                  target.layer,
                  ...(["features", "modules"].includes(target.layer)
                    ? [target.feature]
                    : []),
                ].join("/"),
                specifier,
                feature: target.feature,
              },
            });
        }
        return {
          ImportDeclaration: (node) => check(node.source, node),
          ExportNamedDeclaration: (node) => {
            if (
              source.app === "api" &&
              /\.module\.[cm]?[jt]s$/.test(filename) &&
              !node.source &&
              node.specifiers.length
            ) {
              context.report({
                node,
                messageId: "boundary",
                data: { source: "api/module", target: "provider re-export" },
              });
            }
            check(node.source, node);
          },
          ExportAllDeclaration: (node) => check(node.source, node),
          ImportExpression: (node) => check(node.source),
          CallExpression: (node) => {
            if (
              node.callee.type === "Identifier" &&
              node.callee.name === "require"
            )
              check(node.arguments[0]);
          },
        };
      },
    },
  },
};
