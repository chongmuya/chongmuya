import { Injectable } from "@nestjs/common";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ConfigService } from "../../../config/config.service.js";
import { DomainHttpException } from "../../../common/http/domain-http.exception.js";
import {
  normalizeSolapiReport,
  solapiMessageSchema,
} from "./solapi-message.gateway.js";
const reportSchema = z.array(solapiMessageSchema).max(1000);
export function validSolapiSignature(
  header: string | undefined,
  raw: Buffer | undefined,
  secret: string | undefined,
  now = Date.now(),
) {
  if (!header || !raw || !secret) return false;
  const match = /^t=(\d{10}),v1=([a-f0-9]{64})$/.exec(
    header.replace(/,\s+/g, ","),
  );
  if (!match || Math.abs(now / 1000 - Number(match[1])) > 300) return false;
  const key = createHash("sha1").update(secret).digest("hex");
  const expected = createHmac("sha256", key)
    .update(`${match[1]}.`)
    .update(raw)
    .digest();
  return timingSafeEqual(expected, Buffer.from(match[2], "hex"));
}
@Injectable()
export class SolapiWebhookDecoder {
  constructor(private readonly config: ConfigService) {}
  decode(header: string | undefined, raw: Buffer | undefined) {
    if (
      !validSolapiSignature(
        header,
        raw,
        this.config.environment.solapiWebhookSecret,
      )
    )
      throw new DomainHttpException("MERCHANT_LINK_INVALID");
    let body: unknown;
    try {
      body = JSON.parse(raw!.toString("utf8"));
    } catch {
      throw new DomainHttpException("VALIDATION_FAILED");
    }
    const parsed = reportSchema.safeParse(body);
    if (!parsed.success) throw new DomainHttpException("VALIDATION_FAILED");
    return parsed.data.map(normalizeSolapiReport);
  }
}
