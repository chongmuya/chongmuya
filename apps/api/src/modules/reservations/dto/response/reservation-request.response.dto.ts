import type { InquirySnapshot } from "../../types/inquiry.js";
export type ReservationRequestDto = {
  id: string;
  eventId: string;
  createdAt: string;
  status: "RECEIVED";
  round: number;
  version: number;
  lifecycle: "ACTIVE" | "SELECTED" | "CLOSED";
  isCurrent: boolean;
  canReinquire: boolean;
  reinquiryBlockedReason:
    "STORE_SELECTED" | "AWAITING_REPLY" | "VALID_PROPOSAL" | null;
  history: { id: string; round: number; state: string }[];
  selection: {
    id: string;
    targetId: string;
    revision: number;
    version: number;
    status: "PREPARING";
    snapshot: import("../../types/merchant-reply.js").ReplySnapshot;
    selectedAt: string;
  } | null;
  notifications: {
    id: string;
    recipientKind: "ORGANIZER" | "MERCHANT";
    status: string;
    provider: "fake" | "solapi" | null;
    errorCode: string | null;
    updatedAt: string;
  }[];
  currentContact: {
    accountId: string | null;
    name: string;
    maskedPhone: string;
  };
  responseCount: number;
  proposalCount: number;
  declineCount: number;
  snapshot: InquirySnapshot;
  contact: {
    name: string;
    maskedPhone: string;
    phoneVerifiedAt: string | null;
  };
  targets: {
    id: string;
    candidateState: ReturnType<
      typeof import("../../lib/candidate-state.js").candidateState
    >;
    closedAt: string | null;
    canSelect: boolean;
    restaurantId: string;
    restaurantName: string;
    photoPath: string | null;
    address: string;
    isDemo: boolean;
    deliveryStatus: import("../../types/merchant-reply.js").DeliveryState;
    delivery: {
      provider: "fake" | "solapi" | null;
      failureStage: "SUBMISSION" | "DELIVERY" | null;
      errorCode: string | null;
      updatedAt: string;
    } | null;
    response: ReturnType<typeof import("../../lib/reply-view.js").replyView>;
  }[];
};
