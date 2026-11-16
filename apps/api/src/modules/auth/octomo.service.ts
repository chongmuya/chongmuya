import { Injectable } from "@nestjs/common";
import { ConfigService } from "../../config/config.service.js";
import { DomainHttpException } from "../../common/http/domain-http.exception.js";

export const OCTOMO_RECEIVER = "16663538";
const BASE = "https://api.octoverse.kr/octomo/v1/public/message";

@Injectable()
export class OctomoService {
  constructor(private readonly config: ConfigService) {}
  assertConfigured() {
    if (!this.config.environment.octomoApiKey)
      throw new DomainHttpException("PHONE_VERIFICATION_UNAVAILABLE");
  }
  private async post(
    path: "exists" | "qr-code",
    body: object,
  ): Promise<unknown> {
    this.assertConfigured();
    try {
      const response = await fetch(`${BASE}/${path}`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(5000),
        headers: {
          Authorization: `Octomo ${this.config.environment.octomoApiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok)
        throw new DomainHttpException("PHONE_VERIFICATION_UNAVAILABLE");
      const text = await response.text();
      if (text.length > 100_000)
        throw new DomainHttpException("PHONE_VERIFICATION_UNAVAILABLE");
      return JSON.parse(text) as unknown;
    } catch {
      // External error bodies/URLs/keys never cross the application boundary.
      throw new DomainHttpException("PHONE_VERIFICATION_UNAVAILABLE");
    }
  }
  async exists(phone: string, text: string) {
    const result = await this.post("exists", {
      mobileNum: phone,
      text,
      withinMinutes: 5,
    });
    if (
      !result ||
      typeof result !== "object" ||
      !("exists" in result) ||
      typeof result.exists !== "boolean"
    )
      throw new DomainHttpException("PHONE_VERIFICATION_UNAVAILABLE");
    return result.exists;
  }
  async qrCode(text: string) {
    const result = await this.post("qr-code", { text });
    if (
      !result ||
      typeof result !== "object" ||
      !("qrCode" in result) ||
      typeof result.qrCode !== "string" ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(result.qrCode)
    )
      throw new DomainHttpException("PHONE_VERIFICATION_UNAVAILABLE");
    return result.qrCode;
  }
}
