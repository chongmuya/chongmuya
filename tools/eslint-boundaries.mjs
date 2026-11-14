import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Explicit public API, not a suffix-based allowance for every service/guard.
// Providers must also be exported by the owning Nest module. Types/decorators
// are source imports and do not require a DI registration.
const apiPublicImports = {
  "auth/jwt-access.guard": ["AccessGuard"],
  "auth/auth.service": ["AuthService"],
  "auth/current-user.decorator": ["CurrentUser"],
  "auth/auth-user": ["AuthUser"],
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
        function check(node, declaration) {
          if (typeof node?.value !== "string") return;
          const specifier = node.value;
          let targetFile;
          if (specifier.startsWith("."))
            targetFile = path.resolve(path.dirname(filename), specifier);
          else if (specifier.startsWith("@/"))
            targetFile = path.resolve(
              root,
              "apps",
              source.app,
              specifier.slice(2),
            );
          else if (specifier.startsWith("@chongmuya/"))
            targetFile = path.resolve(
              root,
              "apps",
              specifier.slice("@chongmuya/".length),
            );
          else return;
          const target = area(targetFile);
          if (!target) return;
          let invalid = source.app !== target.app;
          if (source.app === "web") {
            const rank = { app: 0, features: 1, shared: 2 };
            invalid ||= rank[source.layer] > rank[target.layer];
            invalid ||=
              source.layer === "features" &&
              target.layer === "features" &&
              source.feature !== target.feature;
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
