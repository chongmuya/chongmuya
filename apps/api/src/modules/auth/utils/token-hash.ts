import { createHash } from "node:crypto";

export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
