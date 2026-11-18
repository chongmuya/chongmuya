import type { InquirySnapshot } from "../../types/inquiry.js";
export type ReservationRequestDto = {
  id: string;
  eventId: string;
  createdAt: string;
  status: "RECEIVED";
  responseCount: 0;
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
    deliveryStatus: "PENDING";
  }[];
};
