import type { InquirySnapshot } from "../../types/inquiry.js";
export type ReservationRequestDto = {
  id: string;
  eventId: string;
  createdAt: string;
  status: "RECEIVED";
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
    restaurantId: string;
    restaurantName: string;
    address: string;
    isDemo: boolean;
    deliveryStatus: import("../../types/merchant-reply.js").DeliveryState;
    delivery: {
      provider: "fake" | "solapi" | null;
      failureStage: "SUBMISSION" | "DELIVERY" | null;
      errorCode: string | null;
      updatedAt: string;
    } | null;
    response: ReturnType<
      typeof import("../../merchant-replies.service.js").replyView
    >;
  }[];
};
