import { z } from "zod";
// Shared by runtime and the offline local link exporter; no provider configuration.
export const linkEnvironmentFields = {
  AUTH_SECRET: z.string().min(32).optional(),
  MERCHANT_REPLY_TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional(),
  WEB_ORIGIN: z.url().refine((value) => {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && url.origin === value;
    } catch {
      return false;
    }
  }),
};
