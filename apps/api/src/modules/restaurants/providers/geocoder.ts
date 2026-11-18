import type { VerifiedAddress } from "../types/registration.js";
export abstract class Geocoder {
  abstract search(query: string): Promise<VerifiedAddress[]>;
}
