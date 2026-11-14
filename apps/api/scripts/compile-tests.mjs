import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
// tsc does not remove old output after source files move. Stale entities would
// be loaded alongside their replacements by the production entity glob.
rmSync(new URL("../dist-test", import.meta.url), {
  recursive: true,
  force: true,
});
execFileSync(
  process.execPath,
  [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.test.json"],
  {
    cwd: appRoot,
    stdio: "inherit",
  },
);
