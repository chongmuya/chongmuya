import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.string().regex(/^\d+$/).default("3001")
    .transform(Number).pipe(z.int().min(1).max(65535)),
  DATABASE_URL: z.url().refine((value) => {
    try {
      const url = new URL(value);
      return ["postgres:", "postgresql:"].includes(url.protocol) &&
        Boolean(url.hostname) && url.pathname.length > 1;
    } catch {
      return false;
    }
  }),
  // Boolean("false") is true; accept only these two explicit strings.
  API_DOCS_ENABLED: z.enum(["true", "false"]).optional(),
}).transform((env) => ({
  nodeEnv: env.NODE_ENV,
  port: env.API_PORT,
  databaseUrl: env.DATABASE_URL,
  docsEnabled: env.API_DOCS_ENABLED === undefined
    ? env.NODE_ENV !== "production"
    : env.API_DOCS_ENABLED === "true",
}));

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(env: NodeJS.ProcessEnv): Environment {
  const result = environmentSchema.safeParse(env);
  if (!result.success) {
    // Never log a ZodError: issues can contain input values or credentials.
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Invalid environment variables: ${fields.join(", ")}`);
  }
  return result.data;
}
