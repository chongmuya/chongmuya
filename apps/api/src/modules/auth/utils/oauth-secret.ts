import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
const key = (secret: string) =>
  createHash("sha256").update(`kakao-pkce:${secret}`).digest();
export function sealVerifier(value: string, secret: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
export function openVerifier(value: string, secret: string) {
  const data = Buffer.from(value, "base64url"),
    decipher = createDecipheriv(
      "aes-256-gcm",
      key(secret),
      data.subarray(0, 12),
    );
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    decipher.update(data.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
