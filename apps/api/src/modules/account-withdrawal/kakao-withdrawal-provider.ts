import { Injectable } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { ConfigService } from "../../config/config.service.js";

export function validKakaoSubject(id: string) {
  return /^[1-9][0-9]{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n;
}

type ProviderState = "matched" | "absent" | "rejected" | "unknown";

@Injectable()
export class KakaoWithdrawalProvider {
  constructor(private readonly config: ConfigService) {}

  binding() {
    const { kakaoAdminKey, kakaoClientId, authSecret } =
      this.config.environment;
    if (!kakaoAdminKey || !kakaoClientId) return null;
    return createHmac("sha256", authSecret)
      .update(
        JSON.stringify(["kakao-withdrawal", kakaoClientId, kakaoAdminKey]),
      )
      .digest("hex");
  }

  inspect(id: string) {
    return this.send("/v2/user/me", id);
  }

  unlink(id: string) {
    return this.send("/v1/user/unlink", id);
  }

  private async send(
    path: "/v2/user/me" | "/v1/user/unlink",
    id: string,
  ): Promise<ProviderState> {
    const key = this.config.environment.kakaoAdminKey;
    if (!key || !validKakaoSubject(id)) return "rejected";
    const body = new URLSearchParams({
      target_id_type: "user_id",
      target_id: id,
    });
    if (path === "/v2/user/me") body.set("property_keys", "[]");
    let response: Response;
    let payload: unknown;
    try {
      response = await fetch(`https://kapi.kakao.com${path}`, {
        method: "POST",
        headers: {
          Authorization: `KakaoAK ${key}`,
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(
          Math.min(4000, this.config.environment.providerTimeoutMs),
        ),
      });
      const raw = await response.text();
      if (raw.length > 16384) return "unknown";
      // Kakao uses JSON Long values. Preserve the source digits beyond Number's safe range.
      payload = JSON.parse(
        raw,
        (name: string, value: unknown, context?: { source?: string }) =>
          name === "id" && typeof value === "number"
            ? context?.source && validKakaoSubject(context.source)
              ? BigInt(context.source)
              : null
            : value,
      );
    } catch {
      return "unknown";
    }
    if (!payload || typeof payload !== "object") return "unknown";
    if (response.status === 200 && "id" in payload && payload.id === BigInt(id))
      return "matched";
    if ("code" in payload) {
      if (response.status === 400 && payload.code === -101) return "absent";
      if (
        (response.status === 400 && payload.code === -2) ||
        (response.status === 401 && payload.code === -401) ||
        (response.status === 403 &&
          (payload.code === -3 || payload.code === -5)) ||
        (response.status === 400 && payload.code === -10)
      )
        return "rejected";
    }
    return "unknown";
  }
}
