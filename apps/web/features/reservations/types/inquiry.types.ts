export type InquiryConditions = {
  startsAt: string;
  expectedGuests: number;
  region: string;
  seating: "CLOSE" | "SEPARATED" | "ANY";
  space: "HALL" | "ROOM" | "FLOOR" | "WHOLE" | "ANY";
  seatingImportance: "REQUIRED" | "PREFERRED" | null;
  spaceImportance: "REQUIRED" | "PREFERRED" | null;
  budgetBasis: "PER_PERSON" | "TOTAL" | null;
  budgetAmount: number | null;
  alcohol: "INCLUDED" | "EXCLUDED" | "UNKNOWN" | null;
  additionalRequests: string | null;
};
export type InquirySnapshot = InquiryConditions & {
  eventName: string;
  groupName: string | null;
  groupType: string | null;
};

export type ReservationRequest = {
  id: string;
  eventId: string;
  createdAt: string;
  status: "RECEIVED";
  responseCount: number;
  proposalCount?: number;
  declineCount?: number;
  snapshot: InquirySnapshot;
  contact: {
    name: string;
    maskedPhone: string;
    phoneVerifiedAt: string | null;
  };
  targets: {
    id: string;
    restaurantId: string;
    restaurantName: string;
    address: string;
    isDemo: boolean;
    deliveryStatus:
      | "PENDING"
      | "PROCESSING"
      | "ACCEPTED"
      | "DELIVERED"
      | "FAILED"
      | "UNKNOWN"
      | "HELD"
      | "CANCELLED";
    delivery?: {
      provider: "fake" | "solapi" | null;
      failureStage: "SUBMISSION" | "DELIVERY" | null;
      errorCode: string | null;
      updatedAt: string;
    } | null;
    response?: import("@/features/merchant-replies/types").Reply | null;
  }[];
};

export type CreateInquiry = {
  requestKey: string;
  mode: "DIRECT";
  expectedEventVersion: number;
  restaurantIds: string[];
  conditions: InquiryConditions;
  contact: { name: string; phone: string };
};
