import path from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ts = createRequire(path.join(root, "apps/web/package.json"))(
  "typescript",
);
const publicEntries = new Set(["client", "server", "types"]);

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
  "auth/guards/jwt-access.guard": ["AccessGuard"],
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
        },
      },
      create(context) {
        const filename = context.filename;
        const source = area(filename);
        if (!source) return {};
        let graph;
        function check(node, declaration) {
          if (typeof node?.value !== "string") return;
          const specifier = node.value;
          const targetFile = resolveImport(filename, specifier);
          if (!targetFile) return;
          const target = area(targetFile);
          if (!target) return;
          let invalid = source.app !== target.app;
          if (source.app === "web") {
            const rank = { app: 0, features: 1, shared: 2 };
            invalid ||= rank[source.layer] > rank[target.layer];
            if (
              target.layer === "features" &&
              (source.layer === "app" ||
                (source.layer === "features" &&
                  source.feature !== target.feature))
            ) {
              invalid ||= !isPublicEntry(targetFile);
              if (source.layer === "features" && !invalid) {
                graph ??= featureGraph();
                invalid ||= hasDependencyPath(
                  graph,
                  target.feature,
                  source.feature,
                );
              }
            }
            const clientModule = context.sourceCode.ast.body.some(
              (item) =>
                item.type === "ExpressionStatement" &&
                item.expression.value === "use client",
            );
            invalid ||=
              clientModule &&
              /[/\\]server(?:\.[cm]?[jt]sx?)?$/.test(targetFile);
          }
          if (source.app === "api") {
            invalid ||=
              ["common", "config", "database"].includes(source.layer) &&
              target.layer === "modules";
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
              messageId: "boundary",
              data: {
                source: `${source.app}/${source.layer}`,
                target: `${target.app}/${target.layer}`,
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
