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
