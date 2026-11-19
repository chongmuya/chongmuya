import { readFile, writeFile, rename, access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import {
  environmentVariableNames,
  parseEnvironment,
} from "../dist/config/environment.js";
import {
  parseDeploymentDatabase,
  validateDeploymentDatabasePair,
  rdsCaPath,
} from "../dist/config/database-environment.js";

const caPath = rdsCaPath;
const production = {
  NODE_ENV: "production",
  WEB_ORIGIN: "https://chongmuya.com",
  API_PORT: "3001",
  API_DOCS_ENABLED: "false",
  TRUST_PROXY_HOPS: "1",
  MESSAGE_PROVIDER: "solapi",
  GEOCODING_PROVIDER: "naver",
};
const invalid = (names) => {
  throw new Error(`Invalid environment variables: ${names.join(", ")}`);
};

async function validate(env) {
  parseEnvironment(env);
  const wrong = Object.entries(production)
    .filter(([key, value]) => env[key] !== value)
    .map(([key]) => key);
  if (
    env.KAKAO_REDIRECT_URI &&
    env.KAKAO_REDIRECT_URI !==
      "https://api.chongmuya.com/api/v1/auth/kakao/callback"
  )
    wrong.push("KAKAO_REDIRECT_URI");
  if (wrong.length) invalid(wrong);
  parseDeploymentDatabase(env.DATABASE_URL, "app");
  try {
    await access(caPath, constants.R_OK);
  } catch {
    throw new Error("RDS CA file is not readable.");
  }
}

async function atomicEnv(path, entries) {
  const temporary = `${path}.tmp`;
  await writeFile(
    temporary,
    entries.map(([key, value]) => `${key}=${value}\n`).join(""),
    { mode: 0o600, flag: "wx" },
  );
  await rename(temporary, path);
}

try {
  const [mode, directory, migrationFile] = process.argv.slice(2);
  if ((mode === "prepare" || mode === "seed") && directory) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (mode === "seed") {
      if (
        payload.Parameter?.Name !== "/chongmuya/prod/DATABASE_URL" ||
        typeof payload.Parameter.Value !== "string" ||
        /[\r\n\0]/.test(payload.Parameter.Value)
      )
        invalid(["DATABASE_URL"]);
      parseDeploymentDatabase(payload.Parameter.Value, "app");
      await atomicEnv(join(directory, "db.env"), [
        ["DATABASE_URL", payload.Parameter.Value],
      ]);
    } else {
      if (!Array.isArray(payload.Parameters) || payload.NextToken)
        throw new Error("Parameter Store response is incomplete.");
      const env = {};
      for (const parameter of payload.Parameters) {
        if (
          typeof parameter.Name !== "string" ||
          !parameter.Name.startsWith("/chongmuya/prod/")
        )
          throw new Error("Invalid Parameter Store response.");
        const key = parameter.Name.slice("/chongmuya/prod/".length);
        // Only application configuration reaches the process; never NODE_OPTIONS/PGSSL*.
        if (!environmentVariableNames.includes(key)) continue;
        if (
          Object.hasOwn(env, key) ||
          typeof parameter.Value !== "string" ||
          /[\r\n\0]/.test(parameter.Value)
        )
          invalid([key]);
        env[key] = parameter.Value;
      }
      await validate(env);
      if (migrationFile) {
        const { Parameter } = JSON.parse(await readFile(migrationFile, "utf8"));
        if (
          Parameter?.Name !== "/chongmuya/deploy/prod/DATABASE_URL" ||
          typeof Parameter.Value !== "string" ||
          /[\r\n\0]/.test(Parameter.Value)
        )
          invalid(["DATABASE_URL"]);
        validateDeploymentDatabasePair(env.DATABASE_URL, Parameter.Value);
        await atomicEnv(join(directory, "db.env"), [
          ["DATABASE_URL", Parameter.Value],
        ]);
      }
      await atomicEnv(
        join(directory, "api.env"),
        Object.entries(env).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
  } else if (mode === "check") {
    await validate(process.env);
    // Read the CA as the runtime user as well as checking its existence.
    await readFile(caPath);
  } else throw new Error("Invalid deployment configuration command.");
  console.log("Deployment configuration valid.");
} catch (error) {
  const message = error instanceof Error ? error.message : "";
  console.error(
    /^Invalid environment variables: [A-Z_, ]+$/.test(message)
      ? message
      : "Deployment configuration failed. Check parameter names, single-line values and RDS CA access.",
  );
  process.exitCode = 1;
}
