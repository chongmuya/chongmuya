import type { Proposal } from "../schemas/reply.schema";
export type RequestSnapshot = {
  eventName: string;
  groupName: string | null;
  startsAt: string;
  expectedGuests: number;
  region: string;
  space: "ANY" | "HALL" | "ROOM" | "FLOOR" | "WHOLE";
  seating: "ANY" | "CLOSE" | "SEPARATED";
  seatingImportance: string | null;
  spaceImportance: string | null;
  budgetBasis: string | null;
  budgetAmount: number | null;
  alcohol: string | null;
  additionalRequests: string | null;
};
export type Reply = {
  kind: "AVAILABLE" | "CHANGE" | "DECLINE";
  revision: number;
  snapshot: RequestSnapshot & {
    offered: Proposal | null;
    requested: RequestSnapshot;
  };
  reason: string;
  createdAt: string;
  expiresAt: string | null;
  state: "DECLINED" | "EXPIRED" | "PROPOSED";
};
export type MerchantInquiry = {
  targetId: string;
  restaurantName: string;
  snapshot: RequestSnapshot;
  organizerName: string;
  version: number;
  response: Reply | null;
  defaults: {
    proposal: Proposal;
    expiresAt: string | null;
    depositDescription: string | null;
    bookingDescription: string | null;
    menuDescription: string | null;
  };
  linkExpiresAt: string | null;
};
