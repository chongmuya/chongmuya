import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ConfigService } from "../../../config/config.service.js";
import { DomainHttpException } from "../../../common/http/domain-http.exception.js";
import type { VerifiedAddress } from "../types/registration.js";
const resultSchema = z.object({
  status: z.literal("OK"),
  addresses: z
    .array(
      z.object({
        roadAddress: z.string().max(200),
        jibunAddress: z.string().max(200),
        x: z.string(),
        y: z.string(),
        addressElements: z
          .array(
            z.object({
              types: z.array(z.string()).optional(),
              type: z.array(z.string()).optional(),
              longName: z.string(),
            }),
          )
          .optional(),
      }),
    )
    .max(100),
});
@Injectable()
export class GeocodingProvider {
  constructor(private readonly config: ConfigService) {}
  async search(query: string): Promise<VerifiedAddress[]> {
    const env = this.config.environment;
    if (env.geocodingProvider === "fake") {
      if (env.nodeEnv === "production")
        throw new DomainHttpException("GEOCODING_CONFIGURATION");
      if (query.includes("검색실패"))
        throw new DomainHttpException("GEOCODING_UNAVAILABLE");
      if (query.includes("결과없음")) return [];
      return [
        {
          id: randomUUID(),
          query,
          roadAddress: query.trim(),
          jibunAddress: "",
          baseAddress: query.trim(),
          latitude: 37.5401,
          longitude: 127.0695,
          region: "테스트 지역",
          source: "fake",
        },
      ];
    }
    if (!env.naverMapClientId || !env.naverMapClientSecret)
      throw new DomainHttpException("GEOCODING_CONFIGURATION");
    let response: Response;
    try {
      const url = new URL(
        "https://maps.apigw.ntruss.com/map-geocode/v2/geocode",
      );
      url.searchParams.set("query", query);
      response = await fetch(url, {
        headers: {
          "x-ncp-apigw-api-key-id": env.naverMapClientId,
          "x-ncp-apigw-api-key": env.naverMapClientSecret,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(env.providerTimeoutMs),
      });
    } catch {
      throw new DomainHttpException("GEOCODING_UNAVAILABLE");
    }
    if ([401, 403].includes(response.status))
      throw new DomainHttpException("GEOCODING_CONFIGURATION");
    if (response.status === 429)
      throw new DomainHttpException("GEOCODING_LIMIT");
    if (!response.ok) throw new DomainHttpException("GEOCODING_UNAVAILABLE");
    const parsed = resultSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success) throw new DomainHttpException("GEOCODING_UNAVAILABLE");
    return parsed.data.addresses.map((a) => {
      const longitude = Number(a.x),
        latitude = Number(a.y);
      if (
        !a.x.trim() ||
        !a.y.trim() ||
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        Math.abs(longitude) > 180 ||
        Math.abs(latitude) > 90 ||
        !(a.roadAddress || a.jibunAddress)
      )
        throw new DomainHttpException("GEOCODING_UNAVAILABLE");
      const region =
        a.addressElements?.find((e) =>
          (e.types ?? e.type ?? []).includes("DONGMYUN"),
        )?.longName ??
        (a.roadAddress || a.jibunAddress).split(" ").slice(0, 2).join(" ");
      return {
        id: randomUUID(),
        query,
        roadAddress: a.roadAddress,
        jibunAddress: a.jibunAddress,
        baseAddress: a.roadAddress || a.jibunAddress,
        longitude,
        latitude,
        region,
        source: "naver",
      };
    });
  }
}
