import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Geocoder } from "./geocoder.js";
import type { VerifiedAddress } from "../types/registration.js";

@Injectable()
export class FakeGeocoder extends Geocoder {
  async search(query: string): Promise<VerifiedAddress[]> {
    return [
      {
        id: randomUUID(),
        query,
        roadAddress: query.trim(),
        jibunAddress: "",
        baseAddress: query.trim(),
        latitude: 37.5401,
        longitude: 127.0695,
        region: "데모 지역",
        source: "fake",
      },
    ];
  }
}
