import { z } from "zod";

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    API_PORT: z
      .string()
      .regex(/^\d+$/)
      .default("3001")
      .transform(Number)
      .pipe(z.int().min(1).max(65535)),
    DATABASE_URL: z.url().refine((value) => {
      try {
        const url = new URL(value);
        return (
          ["postgres:", "postgresql:"].includes(url.protocol) &&
          Boolean(url.hostname) &&
          url.pathname.length > 1
        );
      } catch {
        return false;
      }
    }),
    KAKAO_CLIENT_ID: z.string().min(1).regex(/^\S+$/).optional(),
    KAKAO_CLIENT_SECRET: z.string().min(1).regex(/^\S+$/).optional(),
    KAKAO_REDIRECT_URI: z
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          url.pathname === "/api/v1/auth/kakao/callback"
        );
      })
      .optional(),
    AUTH_SECRET: z.string().min(32),
    RESEND_API_KEY: z.string().min(1).regex(/^\S+$/).optional(),
    RESEND_FROM: z
      .string()
      .max(320)
      .refine((value) => {
        if (z.email().safeParse(value).success) return true;
        const match = /^[^<>\r\n]+ <([^<>\s]+)>$/.exec(value);
        return !!match && z.email().safeParse(match[1]).success;
      })
      .optional(),
    RESEND_REPLY_TO: z.email().default("support@chongmuya.com"),
    EMAIL_VERIFICATION_SECRET: z.string().min(32).optional(),
    RESEND_DEBUG: z.enum(["false"]).optional(),
    OCTOMO_API_KEY: z.string().min(1).regex(/^\S+$/).optional(),
    SIGNUP_TERMS_JSON: z
      .string()
      .transform((value, ctx) => {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          ctx.addIssue({ code: "custom", message: "Invalid JSON" });
          return z.NEVER;
        }
      })
      .pipe(
        z
          .array(
            z.object({
              id: z.enum([
                "serviceTerms",
                "privacyCollection",
                "privacyPolicy",
                "marketing",
              ]),
              version: z
                .string()
                .min(1)
                .max(64)
                .regex(/^[A-Za-z0-9._-]+$/),
              url: z
                .url()
                .refine((value) => new URL(value).protocol === "https:"),
            }),
          )
          .length(4)
          .refine((items) => new Set(items.map((item) => item.id)).size === 4),
      )
      .optional(),
    WEB_ORIGIN: z.url().refine((value) => {
      try {
        const url = new URL(value);
        return (
          ["http:", "https:"].includes(url.protocol) && url.origin === value
        );
      } catch {
        return false;
      }
    }),
    // Boolean("false") is true; accept only these two explicit strings.
    API_DOCS_ENABLED: z.enum(["true", "false"]).optional(),
  })
  .superRefine((env, ctx) => {
    const kakaoFields = [
      "KAKAO_CLIENT_ID",
      "KAKAO_CLIENT_SECRET",
      "KAKAO_REDIRECT_URI",
    ] as const;
    if (kakaoFields.some((field) => env[field] !== undefined)) {
      for (const field of kakaoFields)
        if (!env[field])
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: "Required together",
          });
      if (
        env.KAKAO_REDIRECT_URI &&
        env.NODE_ENV === "production" &&
        !env.KAKAO_REDIRECT_URI.startsWith("https://")
      )
        ctx.addIssue({
          code: "custom",
          path: ["KAKAO_REDIRECT_URI"],
          message: "HTTPS required",
        });
    }
    const mailFields = [
      "RESEND_API_KEY",
      "RESEND_FROM",
      "EMAIL_VERIFICATION_SECRET",
    ] as const;
    if (mailFields.some((field) => env[field] !== undefined))
      for (const field of mailFields) {
        if (!env[field])
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: "Required together",
          });
      }
    if (
      env.NODE_ENV === "production" &&
      !env.WEB_ORIGIN.startsWith("https://")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["WEB_ORIGIN"],
        message: "HTTPS required",
      });
    }
  })
  .transform((env) => ({
    kakaoClientId: env.KAKAO_CLIENT_ID,
    kakaoClientSecret: env.KAKAO_CLIENT_SECRET,
    kakaoRedirectUri: env.KAKAO_REDIRECT_URI,
    resendApiKey: env.RESEND_API_KEY,
    resendFrom: env.RESEND_FROM,
    resendReplyTo: env.RESEND_REPLY_TO,
    emailVerificationSecret: env.EMAIL_VERIFICATION_SECRET,
    authSecret: env.AUTH_SECRET,
    octomoApiKey: env.OCTOMO_API_KEY,
    signupTerms: env.SIGNUP_TERMS_JSON,
    webOrigin: env.WEB_ORIGIN,
    nodeEnv: env.NODE_ENV,
    port: env.API_PORT,
    databaseUrl: env.DATABASE_URL,
    docsEnabled:
      env.API_DOCS_ENABLED === undefined
        ? env.NODE_ENV !== "production"
        : env.API_DOCS_ENABLED === "true",
  }));

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(env: NodeJS.ProcessEnv): Environment {
  const result = environmentSchema.safeParse(env);
  if (!result.success) {
    // Never log a ZodError: issues can contain input values or credentials.
    const fields = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
    ];
    throw new Error(`Invalid environment variables: ${fields.join(", ")}`);
  }
  return result.data;
}
