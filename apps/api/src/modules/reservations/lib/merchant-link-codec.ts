import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export const merchantTokenDigest = (raw: string) =>
  createHash("sha256").update(raw).digest("hex");
export function merchantEncryptionKey(env: {
  merchantReplyTokenEncryptionKey?: string;
  authSecret?: string;
  nodeEnv: string;
}) {
  if (env.merchantReplyTokenEncryptionKey)
    return Buffer.from(env.merchantReplyTokenEncryptionKey, "hex");
  if (env.nodeEnv !== "production" && env.authSecret)
    return createHash("sha256")
      .update(`development-merchant-encryption:${env.authSecret}`)
      .digest();
  throw new Error("Merchant link encryption configuration required");
}
export function issueMerchantToken(key: Buffer) {
  const raw = randomBytes(32).toString("base64url"),
    iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const value = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  return {
    digest: merchantTokenDigest(raw),
    encryptedToken: [iv, cipher.getAuthTag(), value]
      .map((v) => v.toString("base64url"))
      .join("."),
  };
}
export function merchantLinkUrl(
  origin: string,
  link: { targetId: string; encryptedToken: string | null },
  key: Buffer,
) {
  if (!link.encryptedToken)
    throw new Error("Merchant link payload unavailable");
  const [iv, tag, value, extra] = link.encryptedToken
    .split(".")
    .map((v) => Buffer.from(v, "base64url"));
  if (!iv || !tag || !value || extra)
    throw new Error("Merchant link payload invalid");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const raw = Buffer.concat([
    decipher.update(value),
    decipher.final(),
  ]).toString("utf8");
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw))
    throw new Error("Merchant link payload invalid");
  return `${origin}/merchant-reply?target=${link.targetId}#token=${raw}`;
}
