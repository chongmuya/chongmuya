import { z } from "zod";
import { linkEnvironmentFields } from "./link-environment.js";
import { databaseEnvironmentSchema } from "./database-environment.js";

const environmentInputSchema = z.object({
  REMINDERS_ENABLED: z.enum(["true", "false"]).default("false"),
  FILES_S3_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
    .optional(),
  FILES_S3_REGION: z
    .string()
    .regex(/^[a-z]{2}-[a-z]+-\d$/)
    .default("ap-northeast-2"),
  FILES_MAX_COUNT: z.coerce.number().int().min(1).max(1000).default(100),
  FILES_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(10485760)
    .max(10737418240)
    .default(524288000),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z
    .string()
    .regex(/^\d+$/)
    .default("3001")
    .transform(Number)
    .pipe(z.int().min(1).max(65535)),
  ...databaseEnvironmentSchema.shape,
  KAKAO_ADMIN_KEY: z.string().min(1).regex(/^\S+$/).optional(),
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
  TRUST_PROXY_HOPS: z
    .enum(["0", "1"])
    .default("0")
    .transform((value) => (value === "1" ? 1 : 0)),
  // Reject stale deployment settings while accepting old, empty local entries.
  TRUSTED_PROXY_CIDRS: z.literal("").optional(),
  MESSAGE_PROVIDER: z.enum(["fake", "solapi"]).default("fake"),
  SOLAPI_API_KEY: z.string().min(1).optional(),
  SOLAPI_API_SECRET: z.string().min(1).optional(),
  SOLAPI_SENDER_NUMBER: z
    .string()
    .regex(/^\d{8,15}$/)
    .optional(),
  SOLAPI_WEBHOOK_SECRET: z.string().min(16).optional(),
  GEOCODING_PROVIDER: z.enum(["fake", "naver"]).default("fake"),
  NAVER_MAP_CLIENT_ID: z.string().min(1).optional(),
  NAVER_MAP_CLIENT_SECRET: z.string().min(1).optional(),
  OWNER_SUPPORT_EMAIL: z.email().optional(),
  ...linkEnvironmentFields,
  PROVIDER_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(10000)
    .default(5000),
  RESERVATION_MANAGEMENT_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(720)
    .default(168),
  MERCHANT_REPLY_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(720)
    .default(168),
  AUTH_SECRET: linkEnvironmentFields.AUTH_SECRET.unwrap(),
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
  // Boolean("false") is true; accept only these two explicit strings.
  API_DOCS_ENABLED: z.enum(["true", "false"]).optional(),
});

export const environmentVariableNames = Object.keys(
  environmentInputSchema.shape,
);

const environmentSchema = environmentInputSchema
  .superRefine((env, ctx) => {
    const required = (fields: (keyof typeof env)[]) => {
      for (const field of fields)
        if (!env[field])
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: "Required for active provider",
          });
    };
    if (env.MESSAGE_PROVIDER === "solapi")
      required([
        "SOLAPI_API_KEY",
        "SOLAPI_API_SECRET",
        "SOLAPI_SENDER_NUMBER",
        "SOLAPI_WEBHOOK_SECRET",
      ]);
    if (env.GEOCODING_PROVIDER === "naver")
      required(["NAVER_MAP_CLIENT_ID", "NAVER_MAP_CLIENT_SECRET"]);
    if (env.NODE_ENV === "production") {
      for (const field of ["MESSAGE_PROVIDER", "GEOCODING_PROVIDER"] as const)
        if (env[field] === "fake")
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: "Development provider forbidden",
          });
      required(["MERCHANT_REPLY_TOKEN_ENCRYPTION_KEY", "OWNER_SUPPORT_EMAIL"]);
    }
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
    trustProxyHops: env.TRUST_PROXY_HOPS,
    messageProvider: env.MESSAGE_PROVIDER,
    filesBucket: env.FILES_S3_BUCKET,
    filesRegion: env.FILES_S3_REGION,
    filesMaxCount: env.FILES_MAX_COUNT,
    filesMaxBytes: env.FILES_MAX_BYTES,
    remindersEnabled: env.REMINDERS_ENABLED === "true",
    solapiApiKey: env.SOLAPI_API_KEY,
    solapiApiSecret: env.SOLAPI_API_SECRET,
    solapiSenderNumber: env.SOLAPI_SENDER_NUMBER,
    solapiWebhookSecret: env.SOLAPI_WEBHOOK_SECRET,
    geocodingProvider: env.GEOCODING_PROVIDER,
    naverMapClientId: env.NAVER_MAP_CLIENT_ID,
    naverMapClientSecret: env.NAVER_MAP_CLIENT_SECRET,
    ownerSupportEmail: env.OWNER_SUPPORT_EMAIL,
    merchantReplyTokenEncryptionKey: env.MERCHANT_REPLY_TOKEN_ENCRYPTION_KEY,
    providerTimeoutMs: env.PROVIDER_TIMEOUT_MS,
    merchantReplyTtlHours: env.MERCHANT_REPLY_TTL_HOURS,
    reservationManagementTtlHours: env.RESERVATION_MANAGEMENT_TTL_HOURS,
    kakaoAdminKey: env.KAKAO_ADMIN_KEY,
    kakaoClientId: env.KAKAO_CLIENT_ID,
    kakaoClientSecret: env.KAKAO_CLIENT_SECRET,
    kakaoRedirectUri: env.KAKAO_REDIRECT_URI,
    resendApiKey: env.RESEND_API_KEY,
    resendFrom: env.RESEND_FROM,
    resendReplyTo: env.RESEND_REPLY_TO,
    emailVerificationSecret: env.EMAIL_VERIFICATION_SECRET,
    authSecret: env.AUTH_SECRET,
    octomoApiKey: env.OCTOMO_API_KEY,
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
  const selected = { ...env };
  // Inactive adapters do not consume credentials. Validate the selected adapter
  // without requiring local fake runs to repair unrelated provider settings.
  if ((selected.MESSAGE_PROVIDER ?? "fake") === "fake") {
    for (const key of [
      "SOLAPI_API_KEY",
      "SOLAPI_API_SECRET",
      "SOLAPI_SENDER_NUMBER",
    ])
      delete selected[key];
    // A valid signing secret may still verify recorded webhook contracts in local tests.
    if (
      !selected.SOLAPI_WEBHOOK_SECRET ||
      selected.SOLAPI_WEBHOOK_SECRET.length < 16
    )
      delete selected.SOLAPI_WEBHOOK_SECRET;
  }
  if ((selected.GEOCODING_PROVIDER ?? "fake") === "fake") {
    delete selected.NAVER_MAP_CLIENT_ID;
    delete selected.NAVER_MAP_CLIENT_SECRET;
  }
  const result = environmentSchema.safeParse(selected);
  if (!result.success) {
    // Never log a ZodError: issues can contain input values or credentials.
    const fields = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
    ];
    throw new Error(`Invalid environment variables: ${fields.join(", ")}`);
  }
  return result.data;
}
