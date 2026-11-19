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
  round?: number;
  version?: number;
  lifecycle?: "ACTIVE" | "SELECTED" | "CLOSED";
  isCurrent?: boolean;
  canReinquire?: boolean;
  reinquiryBlockedReason?:
    "STORE_SELECTED" | "AWAITING_REPLY" | "VALID_PROPOSAL" | null;
  history?: { id: string; round: number; state: string }[];
  selection?: {
    id: string;
    targetId: string;
    revision: number;
    version: number;
    status: "PREPARING";
    snapshot: {
      offered: NonNullable<
        import("@/features/merchant-replies/types").Reply["snapshot"]["offered"]
      > | null;
      requested: InquirySnapshot;
    };
    selectedAt: string;
  } | null;
  notifications?: {
    id: string;
    recipientKind: "ORGANIZER" | "MERCHANT";
    status: string;
    provider: "fake" | "solapi" | null;
    errorCode: string | null;
    updatedAt: string;
  }[];
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
    candidateState?: string;
    closedAt?: string | null;
    canSelect?: boolean;
    restaurantId: string;
    restaurantName: string;
    photoPath?: string | null;
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
  previousRequestId?: string;
  expectedRequestVersion?: number;
  updateEventSchedule?: boolean;
  requestKey: string;
  mode: "DIRECT";
  expectedEventVersion: number;
  restaurantIds: string[];
  conditions: InquiryConditions;
  contact: { name: string; phone: string };
};
