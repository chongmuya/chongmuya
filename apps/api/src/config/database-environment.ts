import { z } from "zod";

export const databaseEnvironmentSchema = z.object({
  DATABASE_URL: z.url().refine((value) => {
    try {
      const url = new URL(value);
      return (
        ["postgres:", "postgresql:"].includes(url.protocol) &&
        !!url.hostname &&
        url.pathname.length > 1
      );
    } catch {
      return false;
    }
  }),
});

export const localDatabaseEnvironmentSchema = databaseEnvironmentSchema
  .extend({
    NODE_ENV: z.enum(["development", "test"]).default("development"),
  })
  .refine(
    ({ DATABASE_URL }) => {
      try {
        const url = new URL(DATABASE_URL);
        return (
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
          !url.search &&
          !url.hash
        );
      } catch {
        return false;
      }
    },
    { path: ["DATABASE_URL"] },
  );

export function parseDatabaseEnvironment(env: NodeJS.ProcessEnv) {
  const parsed = databaseEnvironmentSchema.safeParse(env);
  if (!parsed.success)
    throw new Error("Invalid environment variables: DATABASE_URL");
  return { databaseUrl: parsed.data.DATABASE_URL };
}

export const rdsCaPath = "/run/certs/rds-global-bundle.pem";

// Shared by deployment preflight and the DB-only operational data tool. A restored
// Seoul RDS instance may have a new hostname; never replace TLS verification.
export function parseProductionDatabaseEnvironment(env: NodeJS.ProcessEnv) {
  const parsed = parseDatabaseEnvironment(env);
  if (env.NODE_ENV !== "production")
    throw new Error("Invalid environment variables: NODE_ENV");
  const url = new URL(parsed.databaseUrl);
  if (
    !/^[a-z0-9][a-z0-9.-]*\.ap-northeast-2\.rds\.amazonaws\.com$/.test(
      url.hostname,
    ) ||
    url.pathname !== "/chongmuya" ||
    !url.username ||
    !url.password ||
    (url.port && url.port !== "5432") ||
    url.hash ||
    url.searchParams.getAll("sslmode").length !== 1 ||
    url.searchParams.get("sslmode") !== "verify-full" ||
    url.searchParams.getAll("sslrootcert").length !== 1 ||
    url.searchParams.get("sslrootcert") !== rdsCaPath ||
    [...url.searchParams.keys()].some(
      (key) => !["sslmode", "sslrootcert"].includes(key),
    )
  )
    throw new Error("Invalid environment variables: DATABASE_URL");
  return { ...parsed, host: url.hostname, database: "chongmuya" };
}

// Deployment accounts are separate privileges, not two copies of one URL.
export function parseDeploymentDatabase(
  value: string | undefined,
  role: "app" | "migrator",
) {
  const parsed = parseProductionDatabaseEnvironment({
    NODE_ENV: "production",
    DATABASE_URL: value,
  });
  if (
    decodeURIComponent(new URL(parsed.databaseUrl).username) !==
    `chongmuya_${role}`
  )
    throw new Error("Invalid environment variables: DATABASE_URL");
  return parsed;
}

export function validateDeploymentDatabasePair(app: string, migrator: string) {
  const runtime = parseDeploymentDatabase(app, "app");
  const migration = parseDeploymentDatabase(migrator, "migrator");
  if (
    runtime.host !== migration.host ||
    runtime.database !== migration.database
  )
    throw new Error("Invalid environment variables: DATABASE_URL");
}

// Local developer commands accept only the repository's DB identity. Test targets are explicitly named isolated databases.
export const developmentDatabaseEnvironmentSchema =
  localDatabaseEnvironmentSchema.refine(
    ({ DATABASE_URL, NODE_ENV }) => {
      const url = new URL(DATABASE_URL);
      return (
        decodeURIComponent(url.username) === "chongmuya" &&
        (NODE_ENV === "development"
          ? url.port === "15432" && url.pathname === "/chongmuya"
          : /^\/chongmuya_test(?:_[a-z0-9_]+)?$/.test(url.pathname))
      );
    },
    { path: ["DATABASE_URL"] },
  );
